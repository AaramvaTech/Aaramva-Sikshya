import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BillFineService } from '../bill-fine.service';
import { BillCorrectionService } from '../bill-correction.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { LedgerService } from '../ledger.service';
import { FinanceSettingsService } from '../finance-settings.service';
import { CalendarService } from '../../calendar/calendar.service';
import { GuardianScopeService } from '../../student/guardian-scope.service';
import { CreateCreditNoteDto } from '../dto/bill-correction.dto';
import { reversedExpr, notReversedExpr } from '../bill-reversal.util';
import { guardSurvivingMocks, allowLeakedMockQueue } from '../../../testing/mock-leak-guard';

/**
 * D24-D27-REVERSAL — one convention: a reversal undoes the financial effect,
 * so anything that caps or nets against it must stop counting it.
 *
 * The two subsystems reach that from opposite directions, because they
 * subtract in opposite directions:
 *
 *   corrections  cap   = net − paid − credited        → DROP the reversal from `credited`
 *   fines        delta = totalFine − waived − posted  → ADD the reversal as `waived`
 *
 * Both are tested in one file on purpose. The bug was that the two disagreed;
 * a test that can only see one of them is the shape of test that let them
 * drift apart in the first place.
 */

const mockTx = guardSurvivingMocks({ $queryRawUnsafe: jest.fn(), $executeRawUnsafe: jest.fn() });

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1', triggered_by: 'MANUAL', triggered_by_user_id: 'accountant-1',
    run_date: new Date('2026-08-03'), started_at: new Date('2026-08-03'), finished_at: null,
    invoices_scanned: 0, invoices_fined: 0, total_fine_posted: '0.00', status: 'RUNNING',
    created_at: new Date('2026-08-03'),
    ...overrides,
  };
}

const PER_DAY_RULE = {
  id: 'rule-1', scope: 'GLOBAL', fee_head_id: null, type: 'PER_DAY',
  value: '10.00', grace_days: 0, cap_amount: null,
};

const CANDIDATE = {
  invoice_id: 'inv-1', student_id: 'student-1', academic_year_id: 'year-1', fee_head_ids: [],
};

describe('D24-D27-REVERSAL', () => {
  describe('the shared predicate', () => {
    it('both subsystems ask the ledger chain, and ask it the same way', () => {
      expect(reversedExpr('bc.ledger_entry_id')).toContain('rev.reverses_entry_id = bc.ledger_entry_id');
      expect(reversedExpr('bfa.ledger_entry_id')).toContain('rev.reverses_entry_id = bfa.ledger_entry_id');
      // Exact complements, or the two subsystems can disagree about the same
      // reversal again — which is the whole defect.
      expect(notReversedExpr('x.y')).toBe(`NOT ${reversedExpr('x.y')}`);
    });

    it('reads the chain, never a status column or a new flag', () => {
      const sql = reversedExpr('bfa.ledger_entry_id');
      expect(sql).toContain('student_ledger_entries');
      expect(sql).not.toMatch(/reversed_at|is_reversed|status/);
    });
  });

  // ─── D27 ────────────────────────────────────────────────────────────────
  describe('D27 — a reversed fine accrual does not come back', () => {
    let service: BillFineService;
    let tenantPrisma: jest.Mocked<TenantPrismaService>;
    let ledgerService: jest.Mocked<LedgerService>;
    let calendarService: jest.Mocked<CalendarService>;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          BillFineService,
          { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
          {
            provide: LedgerService,
            useValue: {
              withStudentLock: jest.fn().mockImplementation(
                (_s: string, fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
              ),
              postEntryInTx: jest.fn().mockResolvedValue({ id: 'ledger-2' }),
              reverse: jest.fn(),
            },
          },
          { provide: CalendarService, useValue: { countWorkingDays: jest.fn() } },
        ],
      }).compile();

      service = module.get(BillFineService);
      tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
      ledgerService = module.get(LedgerService) as jest.Mocked<LedgerService>;
      calendarService = module.get(CalendarService) as jest.Mocked<CalendarService>;
      jest.clearAllMocks();
      (ledgerService.postEntryInTx as jest.Mock).mockResolvedValue({ id: 'ledger-2' });
    });

    /**
     * What the run actually COMPUTED — the 4th query is the run-completion
     * UPDATE and its last param is `totalFinePosted.toDb()`. Asserting the
     * mocked RETURNING row instead would only assert the fixture.
     */
    function computedTotal(): string {
      const call = (tenantPrisma.query as jest.Mock).mock.calls[3];
      return String(call[4]);
    }

    /**
     * One fine run over one overdue invoice. `expectPost` decides whether the
     * accrual INSERT row is queued — queueing one the run never reaches would
     * leak into the next test (TEST-MOCK-LEAK-1).
     */
    function arrangeRun(
      workingDays: number,
      state: { already_posted: string; waived: string },
      expectPost: boolean,
    ) {
      calendarService.countWorkingDays.mockResolvedValueOnce(workingDays);
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([runRow()])
        .mockResolvedValueOnce([PER_DAY_RULE])
        .mockResolvedValueOnce([CANDIDATE])
        .mockResolvedValueOnce([runRow({ status: 'COMPLETED' })]);
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([
        { due_date: '2026-07-24', outstanding: '5000.00', ...state },
      ]);
      if (expectPost) mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'accrual-2' }]);
    }

    it('THE FIX: 120 posted then reversed — the next run at the same total posts NOTHING', async () => {
      // 12 working days @ Rs10 = 120, exactly what was waived. Before the fix
      // `already_posted` dropped the reversed row and nothing replaced it, so
      // delta returned to 120 and re-posted the cancelled fine.
      arrangeRun(12, { already_posted: '0.00', waived: '120.00' }, false);

      const result = await service.runLateFees('MANUAL', 'accountant-1');

      expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
      expect(result.invoicesFined).toBe(0);
      expect(computedTotal()).toBe('0.00');
    });

    it('a legitimate NEW period still accrues after a waiver — only the waived part is held back', async () => {
      // 20 days @ Rs10 = 200 total; 120 waived; the 8 days since must post.
      arrangeRun(20, { already_posted: '0.00', waived: '120.00' }, true);

      await service.runLateFees('MANUAL', 'accountant-1');

      expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({
        entryType: 'FINE', debit: '80.00', credit: '0',
      }));
      expect(computedTotal()).toBe('80.00');
    });

    it('waived and still-standing accruals both hold the delta back, and they add', async () => {
      // total 200 = 120 waived + 50 standing + 30 genuinely new.
      arrangeRun(20, { already_posted: '50.00', waived: '120.00' }, true);

      await service.runLateFees('MANUAL', 'accountant-1');

      expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({
        debit: '30.00',
      }));
    });

    it('CONTROL: with nothing waived, accrual is exactly as it was before the fix', async () => {
      arrangeRun(10, { already_posted: '0.00', waived: '0.00' }, true);

      await service.runLateFees('MANUAL', 'accountant-1');

      expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({
        debit: '100.00',
      }));
      expect(computedTotal()).toBe('100.00');
    });

    it('a waiver larger than the recomputed total never posts a negative fine', async () => {
      // A partial payment shrank the base, so totalFine (50) is now below the
      // 120 already waived. delta is negative; nothing may post.
      arrangeRun(5, { already_posted: '0.00', waived: '120.00' }, false);

      const result = await service.runLateFees('MANUAL', 'accountant-1');

      expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
      expect(result.invoicesFined).toBe(0);
    });

    it('the run query splits accrual rows by the reversal chain, both polarities', async () => {
      arrangeRun(12, { already_posted: '0.00', waived: '120.00' }, false);

      await service.runLateFees('MANUAL', 'accountant-1');

      const sql = mockTx.$queryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('AS already_posted');
      expect(sql).toContain('AS waived');
      expect(sql).toContain(notReversedExpr('bfa.ledger_entry_id'));
      expect(sql).toContain(reversedExpr('bfa.ledger_entry_id'));
    });

    it('reverseAccrual still writes no flag — the ledger reversal is the whole record', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
        id: 'accrual-1', bill_invoice_id: 'inv-1', student_id: 'student-1', late_fee_rule_id: 'rule-1',
        accrued_through: new Date('2026-08-03'), days_overdue: 12, total_fine: '120.00',
        delta_posted: '120.00', rule_type_snapshot: 'PER_DAY', rule_value_snapshot: '10.00',
        rule_cap_snapshot: null, ledger_entry_id: 'ledger-1', fine_run_id: 'run-1',
        created_at: new Date('2026-08-03'),
      }]);

      await service.reverseAccrual('accrual-1', 'accountant-1');

      expect(ledgerService.reverse).toHaveBeenCalledWith('ledger-1', 'accountant-1');
      const writes = [
        ...(tenantPrisma.execute as jest.Mock).mock.calls,
        ...(tenantPrisma.query as jest.Mock).mock.calls,
      ].map((c) => String(c[0]));
      expect(writes.some((sql) => /UPDATE\s+bill_fine_accruals/i.test(sql))).toBe(false);
    });
  });

  // ─── D24 ────────────────────────────────────────────────────────────────
  describe('D24 — a reversed credit note gives its cap headroom back', () => {
    let service: BillCorrectionService;
    let tenantPrisma: jest.Mocked<TenantPrismaService>;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          BillCorrectionService,
          { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn(), run: jest.fn() } },
          { provide: TenantContextService, useValue: { getOrThrow: jest.fn().mockReturnValue({ slug: 'demo' }) } },
          {
            provide: LedgerService,
            useValue: {
              withStudentLock: jest.fn().mockImplementation(
                (_s: string, fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
              ),
              postEntryInTx: jest.fn().mockResolvedValue({ id: 'ledger-9' }),
              reverse: jest.fn(),
            },
          },
          {
            provide: FinanceSettingsService,
            useValue: {
              getCreditNoteApprovalThreshold: jest.fn().mockResolvedValue({ creditNoteApprovalThreshold: 5000 }),
            },
          },
          { provide: GuardianScopeService, useValue: { assertOwnsStudent: jest.fn() } },
        ],
      }).compile();

      service = module.get(BillCorrectionService);
      tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
      jest.clearAllMocks();
      (module.get(LedgerService).postEntryInTx as jest.Mock).mockResolvedValue({ id: 'ledger-9' });
      (module.get(FinanceSettingsService).getCreditNoteApprovalThreshold as jest.Mock)
        .mockResolvedValue({ creditNoteApprovalThreshold: 5000 });
    });

    function dto(overrides: Partial<CreateCreditNoteDto> = {}): CreateCreditNoteDto {
      return {
        studentId: 'student-1', academicYearId: 'year-1', targetInvoiceId: 'invoice-1',
        amount: '1200.00', reasonId: 'reason-1', ...overrides,
      } as CreateCreditNoteDto;
    }

    /** The pre-cap validation reads, then the cap row itself. */
    function arrangeRequest(credited: string, opts: { accepted: boolean; itemId?: string } = { accepted: true }) {
      const q = tenantPrisma.query as jest.Mock;
      q.mockResolvedValueOnce([{ id: 'student-1' }])
        .mockResolvedValueOnce([{ id: 'year-1' }])
        .mockResolvedValueOnce([{ id: 'reason-1' }])
        .mockResolvedValueOnce([{ id: 'invoice-1', student_id: 'student-1', status: 'POSTED' }]);
      if (opts.itemId) q.mockResolvedValueOnce([{ id: opts.itemId, bill_invoice_id: 'invoice-1' }]);

      // creditableAmount. `credited` is what the reversal chain lets through —
      // the fix expressed as data.
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([
        opts.itemId ? { net_amount: '1200.00', credited } : { net_amount: '1200.00', paid: '0.00', credited },
      ]);
      if (!opts.accepted) return; // the cap throws; nothing below is reached

      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ value: BigInt(1) }]) // correction sequence
        .mockResolvedValueOnce([{ id: 'corr-9', amount: '1200.00', status: 'APPROVED' }]); // INSERT RETURNING
    }

    it('CONTROL: an unreversed credit note still consumes the cap — a second one is refused', async () => {
      arrangeRequest('1200.00', { accepted: false }); // full cap credited, not reversed

      await expect(service.requestCreditNote(dto(), 'accountant-1')).rejects.toThrow(BadRequestException);
    });

    it('THE FIX: once reversed it stops counting, so the same amount is accepted again', async () => {
      // Identical invoice, identical request. The only difference is that the
      // earlier credit note's ledger entry now carries a reversal, so the cap
      // query no longer sums it.
      arrangeRequest('0.00');

      await expect(service.requestCreditNote(dto(), 'accountant-1')).resolves.toBeDefined();
    });

    it('the invoice-scoped cap query consults the chain', async () => {
      arrangeRequest('0.00');
      await service.requestCreditNote(dto(), 'accountant-1');

      const capSql = mockTx.$queryRawUnsafe.mock.calls[0][0] as string;
      expect(capSql).toContain('AS credited');
      expect(capSql).toContain(notReversedExpr('bc.ledger_entry_id'));
    });

    it('the ITEM-scoped cap query consults the chain too — neither branch left unguarded', async () => {
      arrangeRequest('0.00', { accepted: true, itemId: 'item-1' });
      await service.requestCreditNote(dto({ targetInvoiceItemId: 'item-1' }), 'accountant-1');

      const capSql = mockTx.$queryRawUnsafe.mock.calls[0][0] as string;
      expect(capSql).toContain('bii.net_amount');
      expect(capSql).toContain(notReversedExpr('bc.ledger_entry_id'));
    });

    it('a reversed credit note does not free MORE than it consumed', async () => {
      // Two credit notes of 600 each, one reversed: 600 still stands, so the
      // cap admits 600 and refuses 700.
      arrangeRequest('600.00', { accepted: false });

      await expect(
        service.requestCreditNote(dto({ amount: '700.00' }), 'accountant-1'),
      ).rejects.toThrow(BadRequestException);
      allowLeakedMockQueue('the cap throws before the sequence/INSERT rows queued for the accepted path');
    });
  });
});
