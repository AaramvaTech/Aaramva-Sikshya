import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BillFineService } from '../bill-fine.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { LedgerService } from '../ledger.service';
import { CalendarService } from '../../calendar/calendar.service';
import { guardSurvivingMocks } from '../../../testing/mock-leak-guard';

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

describe('BillFineService', () => {
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
            withStudentLock: jest.fn().mockImplementation((_studentId: string, fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
            postEntryInTx: jest.fn(),
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
  });

  describe('runLateFees', () => {
    it('B7-4 off by default: no enabled rules -> completes with zero scanned/fined, no invoice query at all', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([runRow()]) // insert run
        .mockResolvedValueOnce([]) // rules query -> empty
        .mockResolvedValueOnce([runRow({ status: 'COMPLETED' })]); // update run returning

      const result = await service.runLateFees('MANUAL', 'accountant-1');

      expect(result.invoicesScanned).toBe(0);
      expect(result.invoicesFined).toBe(0);
      expect(result.status).toBe('COMPLETED');
      expect(tenantPrisma.query).toHaveBeenCalledTimes(3); // insert run, rules, update-run-returning
    });

    it('PER_DAY accrual: 10 days overdue @ Rs10/day posts one FINE debit of 100, one accrual row', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([runRow()]) // insert run
        .mockResolvedValueOnce([{ // rules
          id: 'rule-1', scope: 'GLOBAL', fee_head_id: null, type: 'PER_DAY',
          value: '10.00', grace_days: 0, cap_amount: null,
        }])
        .mockResolvedValueOnce([{ invoice_id: 'inv-1', student_id: 'student-1', academic_year_id: 'year-1', fee_head_ids: [] }]) // candidates
        .mockResolvedValueOnce([runRow({ status: 'COMPLETED', invoices_scanned: 1, invoices_fined: 1, total_fine_posted: '100.00' })]); // update run returning

      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ due_date: '2026-07-24', outstanding: '5000.00', already_posted: '0.00' }]) // fresh recompute
        .mockResolvedValueOnce([{ // insert accrual returning
          id: 'accrual-1', bill_invoice_id: 'inv-1', student_id: 'student-1', late_fee_rule_id: 'rule-1',
          accrued_through: new Date('2026-08-03'), days_overdue: 10, total_fine: '100.00', delta_posted: '100.00',
          rule_type_snapshot: 'PER_DAY', rule_value_snapshot: '10.00', rule_cap_snapshot: null,
          ledger_entry_id: 'ledger-1', fine_run_id: 'run-1', created_at: new Date('2026-08-03'),
        }]);
      calendarService.countWorkingDays.mockResolvedValueOnce(10); // CAL-1 Phase 4: working days, not calendar days
      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-1' } as any);

      const result = await service.runLateFees('MANUAL', 'accountant-1');

      // dayAfterDue is derived from the mocked due_date; today is the real
      // clock (todayAdInNepal isn't mocked here, matching the pre-existing
      // convention in this file of not asserting on the exact date param).
      expect(calendarService.countWorkingDays).toHaveBeenCalledWith('2026-07-25', expect.any(String));
      expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({
        studentId: 'student-1', entryType: 'FINE', debit: '100.00', credit: '0',
      }));
      expect(result.invoicesScanned).toBe(1);
      expect(result.invoicesFined).toBe(1);
      expect(result.totalFinePosted).toBe(100);
    });

    it('B7-2 settled invoice: outstanding <= 0 posts nothing', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([runRow()])
        .mockResolvedValueOnce([{ id: 'rule-1', scope: 'GLOBAL', fee_head_id: null, type: 'PER_DAY', value: '10.00', grace_days: 0, cap_amount: null }])
        .mockResolvedValueOnce([{ invoice_id: 'inv-1', student_id: 'student-1', academic_year_id: 'year-1', fee_head_ids: [] }])
        .mockResolvedValueOnce([runRow({ status: 'COMPLETED', invoices_scanned: 1 })]);
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ due_date: '2026-07-24', outstanding: '0.00', already_posted: '0.00' }]);
      calendarService.countWorkingDays.mockResolvedValueOnce(10);

      const result = await service.runLateFees('MANUAL', 'accountant-1');

      expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
      expect(result.invoicesFined).toBe(0);
    });

    it('B7-2 in-grace invoice: daysOverdue <= graceDays posts nothing', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([runRow()])
        .mockResolvedValueOnce([{ id: 'rule-1', scope: 'GLOBAL', fee_head_id: null, type: 'PER_DAY', value: '10.00', grace_days: 5, cap_amount: null }])
        .mockResolvedValueOnce([{ invoice_id: 'inv-1', student_id: 'student-1', academic_year_id: 'year-1', fee_head_ids: [] }])
        .mockResolvedValueOnce([runRow({ status: 'COMPLETED', invoices_scanned: 1 })]);
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ due_date: '2026-07-29', outstanding: '5000.00', already_posted: '0.00' }]);
      calendarService.countWorkingDays.mockResolvedValueOnce(5);

      const result = await service.runLateFees('MANUAL', 'accountant-1');

      expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
      expect(result.invoicesFined).toBe(0);
    });

    it('B7-10 idempotency: already_posted equals freshly-computed total -> delta 0, nothing posts', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([runRow()])
        .mockResolvedValueOnce([{ id: 'rule-1', scope: 'GLOBAL', fee_head_id: null, type: 'PER_DAY', value: '10.00', grace_days: 0, cap_amount: null }])
        .mockResolvedValueOnce([{ invoice_id: 'inv-1', student_id: 'student-1', academic_year_id: 'year-1', fee_head_ids: [] }])
        .mockResolvedValueOnce([runRow({ status: 'COMPLETED', invoices_scanned: 1 })]);
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ due_date: '2026-07-24', outstanding: '5000.00', already_posted: '100.00' }]);
      calendarService.countWorkingDays.mockResolvedValueOnce(10);

      const result = await service.runLateFees('MANUAL', 'accountant-1');

      expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
      expect(result.invoicesFined).toBe(0);
      expect(result.totalFinePosted).toBe(0);
    });

    it('B7-3 cap: total clamps, delta only covers the remainder to the cap', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([runRow()])
        .mockResolvedValueOnce([{ id: 'rule-1', scope: 'GLOBAL', fee_head_id: null, type: 'PER_DAY', value: '10.00', grace_days: 0, cap_amount: '80.00' }])
        .mockResolvedValueOnce([{ invoice_id: 'inv-1', student_id: 'student-1', academic_year_id: 'year-1', fee_head_ids: [] }])
        .mockResolvedValueOnce([runRow({ status: 'COMPLETED', invoices_scanned: 1, invoices_fined: 1, total_fine_posted: '80.00' })]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ due_date: '2026-07-24', outstanding: '5000.00', already_posted: '0.00' }])
        .mockResolvedValueOnce([{
          id: 'accrual-1', bill_invoice_id: 'inv-1', student_id: 'student-1', late_fee_rule_id: 'rule-1',
          accrued_through: new Date('2026-08-03'), days_overdue: 10, total_fine: '80.00', delta_posted: '80.00',
          rule_type_snapshot: 'PER_DAY', rule_value_snapshot: '10.00', rule_cap_snapshot: '80.00',
          ledger_entry_id: 'ledger-1', fine_run_id: 'run-1', created_at: new Date('2026-08-03'),
        }]);
      calendarService.countWorkingDays.mockResolvedValueOnce(10);
      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-1' } as any);

      const result = await service.runLateFees('MANUAL', 'accountant-1');

      expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({ debit: '80.00' }));
      expect(result.totalFinePosted).toBe(80);
    });

    it('marks the run FAILED and rethrows if the engine throws unexpectedly', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'run-1', status: 'RUNNING' }])
        .mockRejectedValueOnce(new Error('db exploded'));
      (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(1);

      await expect(service.runLateFees('MANUAL', 'accountant-1')).rejects.toThrow('db exploded');
      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining("status = 'FAILED'"),
        'run-1',
      );
    });
  });

  describe('reverseAccrual', () => {
    it('404s when the accrual does not exist', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(service.reverseAccrual('missing-1', 'owner-1')).rejects.toThrow(NotFoundException);
    });

    it("delegates to LedgerService.reverse with the accrual's ledger_entry_id", async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
        id: 'accrual-1', bill_invoice_id: 'inv-1', student_id: 'student-1', late_fee_rule_id: 'rule-1',
        accrued_through: new Date('2026-08-03'), days_overdue: 10, total_fine: '100.00', delta_posted: '100.00',
        rule_type_snapshot: 'PER_DAY', rule_value_snapshot: '10.00', rule_cap_snapshot: null,
        ledger_entry_id: 'ledger-1', fine_run_id: 'run-1', created_at: new Date('2026-08-03'),
      }]);
      ledgerService.reverse.mockResolvedValueOnce({ id: 'reversal-1' } as any);

      const result = await service.reverseAccrual('accrual-1', 'owner-1');

      expect(ledgerService.reverse).toHaveBeenCalledWith('ledger-1', 'owner-1');
      expect(result.id).toBe('accrual-1');
    });
  });

  describe('findRuns', () => {
    it('paginates run history', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        {
          id: 'run-1', triggered_by: 'MANUAL', triggered_by_user_id: 'accountant-1', run_date: new Date('2026-08-03'),
          started_at: new Date('2026-08-03'), finished_at: new Date('2026-08-03'), invoices_scanned: 1, invoices_fined: 1,
          total_fine_posted: '100.00', status: 'COMPLETED', created_at: new Date('2026-08-03'), total_count: '1',
        },
      ]);
      const result = await service.findRuns({});
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });
});
