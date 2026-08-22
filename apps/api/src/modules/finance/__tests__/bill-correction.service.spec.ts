import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BillCorrectionService } from '../bill-correction.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { LedgerService } from '../ledger.service';
import { FinanceSettingsService } from '../finance-settings.service';
import { Role } from '../../common/enums/role.enum';
import { CreateCreditNoteDto, CreateRefundDto, CreateWriteOffDto, RefundMethod } from '../dto/bill-correction.dto';
import { GuardianScopeService } from '../../student/guardian-scope.service';
import { guardSurvivingMocks } from '../../../testing/mock-leak-guard';

const mockTx = guardSurvivingMocks({
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
});

const mockCorrectionRow = {
  id: 'corr-1',
  correction_number: 'COR-2083-000001',
  type: 'CREDIT_NOTE',
  student_id: 'student-1',
  academic_year_id: 'year-1',
  target_invoice_id: 'invoice-1',
  target_invoice_item_id: null,
  amount: '1200.00',
  reason_id: 'reason-1',
  refund_method: null,
  refund_reference: null,
  status: 'REQUESTED',
  requested_by: 'accountant-1',
  requested_at: new Date('2026-08-01'),
  decided_by: null,
  decided_at: null,
  decision_note: null,
  ledger_entry_id: null,
  requires_approval: true,
  created_at: new Date('2026-08-01'),
  updated_at: new Date('2026-08-01'),
  deleted_at: null,
};

function baseDto(overrides: Partial<CreateCreditNoteDto> = {}): CreateCreditNoteDto {
  return {
    studentId: 'student-1',
    academicYearId: 'year-1',
    targetInvoiceId: 'invoice-1',
    amount: '1200.00',
    reasonId: 'reason-1',
    ...overrides,
  } as CreateCreditNoteDto;
}

describe('BillCorrectionService', () => {
  let service: BillCorrectionService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let ledgerService: jest.Mocked<LedgerService>;
  let financeSettingsService: jest.Mocked<FinanceSettingsService>;
  let guardianScope: jest.Mocked<GuardianScopeService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BillCorrectionService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
        { provide: TenantContextService, useValue: { getOrThrow: () => ({ tenantId: 't-1', slug: 'demo', schemaName: 'tenant_demo' }) } },
        {
          provide: LedgerService,
          useValue: {
            withStudentLock: jest.fn().mockImplementation((_studentId: string, fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
            postEntryInTx: jest.fn(),
            reverse: jest.fn(),
          },
        },
        { provide: FinanceSettingsService, useValue: { getCreditNoteApprovalThreshold: jest.fn() } },
        { provide: GuardianScopeService, useValue: { assertOwnsStudent: jest.fn() } },
      ],
    }).compile();

    service = module.get(BillCorrectionService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    ledgerService = module.get(LedgerService) as jest.Mocked<LedgerService>;
    financeSettingsService = module.get(FinanceSettingsService) as jest.Mocked<FinanceSettingsService>;
    guardianScope = module.get(GuardianScopeService) as jest.Mocked<GuardianScopeService>;
    jest.clearAllMocks();
    financeSettingsService.getCreditNoteApprovalThreshold.mockResolvedValue({ creditNoteApprovalThreshold: 5000 });
  });

  function mockRequestPrelude() {
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ id: 'student-1' }]) // student
      .mockResolvedValueOnce([{ id: 'year-1' }]) // academic year
      .mockResolvedValueOnce([{ id: 'reason-1' }]) // reason
      .mockResolvedValueOnce([{ id: 'invoice-1', student_id: 'student-1', status: 'POSTED' }]); // invoice
  }

  describe('requestCreditNote — validation', () => {
    it('404s when the student does not exist', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(service.requestCreditNote(baseDto(), 'accountant-1')).rejects.toThrow(NotFoundException);
    });

    it('404s when the invoice does not belong to the student', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'student-1' }])
        .mockResolvedValueOnce([{ id: 'year-1' }])
        .mockResolvedValueOnce([{ id: 'reason-1' }])
        .mockResolvedValueOnce([{ id: 'invoice-1', student_id: 'someone-else', status: 'POSTED' }]);
      await expect(service.requestCreditNote(baseDto(), 'accountant-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects a zero amount', async () => {
      mockRequestPrelude();
      await expect(service.requestCreditNote(baseDto({ amount: '0.00' }), 'accountant-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('requestCreditNote — B6-10 direction + threshold (B6-3)', () => {
    it('below threshold: auto-posts APPROVED, requester = decider, one CREDIT_NOTE credit entry', async () => {
      mockRequestPrelude();
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ total_receivable: '5000.00', paid: '0.00', credited: '0.00' }]) // creditableAmount
        .mockResolvedValueOnce([{ value: BigInt(1) }]) // sequence
        .mockResolvedValueOnce([{ ...mockCorrectionRow, status: 'APPROVED', requires_approval: false, decided_by: 'accountant-1' }]); // insert RETURNING *
      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-1' } as any);

      const result = await service.requestCreditNote(baseDto({ amount: '1200.00' }), 'accountant-1');

      expect(result.status).toBe('APPROVED');
      expect(result.requiresApproval).toBe(false);
      expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({
        studentId: 'student-1', academicYearId: 'year-1', entryType: 'CREDIT_NOTE', debit: '0', credit: '1200.00',
      }));
      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE bill_corrections'),
        'ledger-entry-1', 'corr-1',
      );
    });

    it('at/above threshold: stays REQUESTED, nothing posts', async () => {
      mockRequestPrelude();
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ total_receivable: '10000.00', paid: '0.00', credited: '0.00' }])
        .mockResolvedValueOnce([{ value: BigInt(2) }])
        .mockResolvedValueOnce([{ ...mockCorrectionRow, amount: '5000.00', status: 'REQUESTED', requires_approval: true }]);

      const result = await service.requestCreditNote(baseDto({ amount: '5000.00' }), 'accountant-1');

      expect(result.status).toBe('REQUESTED');
      expect(result.requiresApproval).toBe(true);
      expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
      expect(mockTx.$executeRawUnsafe).not.toHaveBeenCalled();
    });
  });

  describe('requestCreditNote — over-credit guard (B6-2)', () => {
    it('rejects when amount exceeds the outstanding-after-existing-credits amount, posts nothing', async () => {
      mockRequestPrelude();
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ total_receivable: '1000.00', paid: '0.00', credited: '500.00' }]); // outstanding = 500

      await expect(service.requestCreditNote(baseDto({ amount: '600.00' }), 'accountant-1')).rejects.toThrow(BadRequestException);
      expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('404s on a missing correction', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(service.approve('missing', 'owner-1', {})).rejects.toThrow(NotFoundException);
    });

    it('409s when the correction is not REQUESTED', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockCorrectionRow, status: 'APPROVED' }]);
      await expect(service.approve('corr-1', 'owner-1', {})).rejects.toThrow(ConflictException);
    });

    it('posts exactly one CREDIT_NOTE credit entry and marks APPROVED', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockCorrectionRow]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ status: 'REQUESTED' }]) // re-check under lock
        .mockResolvedValueOnce([{ total_receivable: '5000.00', paid: '0.00', credited: '0.00' }]) // creditableAmount re-check
        .mockResolvedValueOnce([{ ...mockCorrectionRow, status: 'APPROVED', decided_by: 'owner-1', ledger_entry_id: 'ledger-entry-2' }]); // final UPDATE RETURNING *
      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-2' } as any);

      const result = await service.approve('corr-1', 'owner-1', { note: 'looks right' });

      expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({
        entryType: 'CREDIT_NOTE', debit: '0', credit: '1200.00', studentId: 'student-1',
      }));
      expect(result.status).toBe('APPROVED');
    });

    it('re-validates the over-credit guard at approval time — rejects and posts nothing if it now over-credits', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockCorrectionRow]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ status: 'REQUESTED' }])
        .mockResolvedValueOnce([{ total_receivable: '1000.00', paid: '0.00', credited: '900.00' }]); // outstanding now only 100, amount is 1200

      await expect(service.approve('corr-1', 'owner-1', {})).rejects.toThrow(BadRequestException);
      expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('404s on a missing correction', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([]) // conditional UPDATE returns nothing
        .mockResolvedValueOnce([]); // disambiguating SELECT: also nothing
      await expect(service.reject('missing', 'owner-1', {})).rejects.toThrow(NotFoundException);
    });

    it('409s when the correction is not REQUESTED, posts nothing to the ledger', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([]) // conditional UPDATE matched nothing
        .mockResolvedValueOnce([{ status: 'APPROVED' }]); // disambiguating SELECT
      await expect(service.reject('corr-1', 'owner-1', {})).rejects.toThrow(ConflictException);
      expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
    });

    it('rejects a pending correction, balance untouched', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockCorrectionRow, status: 'REJECTED', decided_by: 'owner-1' }]);
      const result = await service.reject('corr-1', 'owner-1', { note: 'not valid' });
      expect(result.status).toBe('REJECTED');
      expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
    });
  });

  describe('reverse', () => {
    it('400s when the correction has no posted ledger entry', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockCorrectionRow, status: 'REQUESTED', ledger_entry_id: null }]);
      await expect(service.reverse('corr-1', 'owner-1')).rejects.toThrow(BadRequestException);
      expect(ledgerService.reverse).not.toHaveBeenCalled();
    });

    it('delegates to LedgerService.reverse for an approved correction', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockCorrectionRow, status: 'APPROVED', ledger_entry_id: 'ledger-entry-1' },
      ]);
      ledgerService.reverse.mockResolvedValueOnce({ id: 'ledger-entry-reversal' } as any);

      const result = await service.reverse('corr-1', 'owner-1');

      expect(ledgerService.reverse).toHaveBeenCalledWith('ledger-entry-1', 'owner-1');
      expect(result.status).toBe('APPROVED');
      expect(result.ledgerEntryId).toBe('ledger-entry-1');
    });
  });

  describe('findOne — PARENT scoping', () => {
    it('403s a parent who does not own the student', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockCorrectionRow]); // correction fetch
      guardianScope.assertOwnsStudent.mockRejectedValueOnce(new ForbiddenException());
      await expect(service.findOne('corr-1', 'parent-1', Role.PARENT)).rejects.toThrow(ForbiddenException);
    });

    it('lets a parent read their own child\'s correction, with ledger audit trail', async () => {
      guardianScope.assertOwnsStudent.mockResolvedValueOnce(undefined);
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ ...mockCorrectionRow, ledger_entry_id: 'ledger-entry-1' }])
        .mockResolvedValueOnce([
          { id: 'ledger-entry-1', student_id: 'student-1', academic_year_id: 'year-1', entry_date: new Date(), entry_type: 'CREDIT_NOTE', debit: '0', credit: '1200.00', ref_doc_type: 'bill_correction', ref_doc_id: 'corr-1', narration: null, reverses_entry_id: null, created_by: 'owner-1', created_at: new Date() },
        ]);

      const result = await service.findOne('corr-1', 'parent-1', Role.PARENT);
      expect(result.ledgerEntries).toHaveLength(1);
    });
  });

  describe('findAll — PARENT scoping', () => {
    it('restricts to own children when no studentId filter is given', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockCorrectionRow, total_count: '1' }]);
      await service.findAll({}, 'parent-1', Role.PARENT);
      expect(tenantPrisma.query).toHaveBeenCalledWith(
        expect.stringContaining('student_id IN (SELECT student_id FROM guardians WHERE user_id ='),
        'parent-1', 20, 0,
      );
    });
  });

  describe('findAll/findOne — display fields (UI5-STUDENTNAME-JOIN)', () => {
    it('findAll joins students + correction_reasons and maps display fields to camelCase', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockCorrectionRow, student_name: 'Aashna Gurung', admission_number: 'ADM-2083-0001', reason_name: 'Sibling discount error', total_count: '1' },
      ]);

      const result = await service.findAll({});

      const calledSql = (tenantPrisma.query as jest.Mock).mock.calls[0][0] as string;
      expect(calledSql).toContain('LEFT JOIN students s ON s.id = bc.student_id');
      expect(calledSql).toContain('LEFT JOIN correction_reasons cr ON cr.id = bc.reason_id');
      expect(result.data[0].studentName).toBe('Aashna Gurung');
      expect(result.data[0].admissionNumber).toBe('ADM-2083-0001');
      expect(result.data[0].reasonName).toBe('Sibling discount error');
    });

    it('findOne joins students + correction_reasons and maps display fields to camelCase', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockCorrectionRow, student_name: 'Aashna Gurung', admission_number: 'ADM-2083-0001', reason_name: 'Sibling discount error' },
      ]);

      const result = await service.findOne('corr-1');

      expect(result.studentName).toBe('Aashna Gurung');
      expect(result.admissionNumber).toBe('ADM-2083-0001');
      expect(result.reasonName).toBe('Sibling discount error');
    });
  });

  // ─── Checkpoint B: refunds ──────────────────────────────────────────────

  function baseRefundDto(overrides: Partial<CreateRefundDto> = {}): CreateRefundDto {
    return {
      studentId: 'student-1',
      academicYearId: 'year-1',
      amount: '2000.00',
      reasonId: 'reason-1',
      refundMethod: RefundMethod.CASH,
      ...overrides,
    } as CreateRefundDto;
  }

  function mockRefundPrelude() {
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ id: 'student-1' }]) // student
      .mockResolvedValueOnce([{ id: 'year-1' }]) // academic year
      .mockResolvedValueOnce([{ id: 'reason-1' }]); // reason
  }

  describe('requestRefund — validation', () => {
    it('404s when the student does not exist', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(service.requestRefund(baseRefundDto(), 'accountant-1')).rejects.toThrow(NotFoundException);
    });

    it('rejects a zero amount', async () => {
      mockRefundPrelude();
      await expect(service.requestRefund(baseRefundDto({ amount: '0.00' }), 'accountant-1')).rejects.toThrow(BadRequestException);
    });

    it('requires a refundReference for BANK_TRANSFER', async () => {
      mockRefundPrelude();
      await expect(
        service.requestRefund(baseRefundDto({ refundMethod: RefundMethod.BANK_TRANSFER }), 'accountant-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('requestRefund — B6-3 always requires approval, B6-6 guard', () => {
    it('always stays REQUESTED regardless of amount — never auto-posts', async () => {
      mockRefundPrelude();
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ sum: '-2000.00' }]) // availableCredit: balance -2000 -> 2000 available
        .mockResolvedValueOnce([{ value: BigInt(3) }]) // sequence
        .mockResolvedValueOnce([{ ...mockCorrectionRow, type: 'REFUND', amount: '2000.00', status: 'REQUESTED', requires_approval: true, refund_method: 'CASH' }]);

      const result = await service.requestRefund(baseRefundDto({ amount: '2000.00' }), 'accountant-1');

      expect(result.status).toBe('REQUESTED');
      expect(result.requiresApproval).toBe(true);
      expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
    });

    it('rejects when amount exceeds available advance credit, posts nothing', async () => {
      mockRefundPrelude();
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ sum: '-500.00' }]); // only 500 available

      await expect(service.requestRefund(baseRefundDto({ amount: '2000.00' }), 'accountant-1')).rejects.toThrow(BadRequestException);
      expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
    });

    it('rejects when the student owes money (zero available credit), posts nothing', async () => {
      mockRefundPrelude();
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ sum: '1000.00' }]); // student OWES, no credit

      await expect(service.requestRefund(baseRefundDto({ amount: '100.00' }), 'accountant-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Checkpoint B: write-offs ───────────────────────────────────────────

  function baseWriteOffDto(overrides: Partial<CreateWriteOffDto> = {}): CreateWriteOffDto {
    return {
      studentId: 'student-1',
      academicYearId: 'year-1',
      amount: '5000.00',
      reasonId: 'reason-1',
      ...overrides,
    } as CreateWriteOffDto;
  }

  describe('requestWriteOff — validation', () => {
    it('404s when the student does not exist', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(service.requestWriteOff(baseWriteOffDto(), 'accountant-1')).rejects.toThrow(NotFoundException);
    });

    it('rejects a zero amount', async () => {
      mockRefundPrelude();
      await expect(service.requestWriteOff(baseWriteOffDto({ amount: '0.00' }), 'accountant-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('requestWriteOff — B6-3 always requires approval', () => {
    it('balance-level write-off always stays REQUESTED, never auto-posts', async () => {
      mockRefundPrelude();
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ sum: '5000.00' }]) // owedBalance
        .mockResolvedValueOnce([{ value: BigInt(4) }]) // sequence
        .mockResolvedValueOnce([{ ...mockCorrectionRow, type: 'WRITE_OFF', target_invoice_id: null, amount: '5000.00', status: 'REQUESTED', requires_approval: true }]);

      const result = await service.requestWriteOff(baseWriteOffDto({ amount: '5000.00' }), 'accountant-1');

      expect(result.status).toBe('REQUESTED');
      expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
    });

    it('rejects a balance-level write-off exceeding the live balance, posts nothing', async () => {
      mockRefundPrelude();
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ sum: '1000.00' }]); // only owes 1000

      await expect(service.requestWriteOff(baseWriteOffDto({ amount: '5000.00' }), 'accountant-1')).rejects.toThrow(BadRequestException);
      expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
    });

    it('rejects when the student holds advance credit (nothing owed), posts nothing', async () => {
      mockRefundPrelude();
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ sum: '-500.00' }]); // ADVANCE, nothing owed

      await expect(service.requestWriteOff(baseWriteOffDto({ amount: '100.00' }), 'accountant-1')).rejects.toThrow(BadRequestException);
    });

    it('invoice-targeted write-off validates invoice ownership like a credit note', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'student-1' }])
        .mockResolvedValueOnce([{ id: 'year-1' }])
        .mockResolvedValueOnce([{ id: 'reason-1' }])
        .mockResolvedValueOnce([{ id: 'invoice-1', student_id: 'someone-else', status: 'POSTED' }]);
      await expect(
        service.requestWriteOff(baseWriteOffDto({ targetInvoiceId: 'invoice-1' }), 'accountant-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Checkpoint B: approve() dispatches by type ─────────────────────────

  describe('approve — REFUND (B6-10 direction: debit against credit balance)', () => {
    it('posts a debit entry consuming the advance and marks APPROVED', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockCorrectionRow, type: 'REFUND', amount: '2000.00', target_invoice_id: null, refund_method: 'CASH', refund_reference: null },
      ]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ status: 'REQUESTED' }]) // re-check under lock
        .mockResolvedValueOnce([{ sum: '-2000.00' }]) // availableCredit re-check
        .mockResolvedValueOnce([{ ...mockCorrectionRow, type: 'REFUND', status: 'APPROVED', ledger_entry_id: 'ledger-refund-1' }]);
      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-refund-1' } as any);

      const result = await service.approve('corr-1', 'owner-1', {});

      expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({
        entryType: 'REFUND', debit: '2000.00', credit: '0', studentId: 'student-1',
      }));
      expect(result.status).toBe('APPROVED');
    });

    it('re-validates available credit at approval time — rejects and posts nothing if insufficient now', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockCorrectionRow, type: 'REFUND', amount: '2000.00', target_invoice_id: null },
      ]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ status: 'REQUESTED' }])
        .mockResolvedValueOnce([{ sum: '-500.00' }]); // only 500 available now

      await expect(service.approve('corr-1', 'owner-1', {})).rejects.toThrow(BadRequestException);
      expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
    });
  });

  describe('approve — WRITE_OFF (direction: credit, reduces owed balance)', () => {
    it('posts a credit entry for a balance-level write-off and marks APPROVED', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockCorrectionRow, type: 'WRITE_OFF', amount: '5000.00', target_invoice_id: null },
      ]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ status: 'REQUESTED' }])
        .mockResolvedValueOnce([{ sum: '5000.00' }]) // owedBalance re-check
        .mockResolvedValueOnce([{ ...mockCorrectionRow, type: 'WRITE_OFF', status: 'APPROVED', ledger_entry_id: 'ledger-wo-1' }]);
      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-wo-1' } as any);

      const result = await service.approve('corr-1', 'owner-1', {});

      expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({
        entryType: 'WRITE_OFF', debit: '0', credit: '5000.00', studentId: 'student-1',
      }));
      expect(result.status).toBe('APPROVED');
    });

    it('re-validates the balance cap at approval time — rejects and posts nothing if it now exceeds', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockCorrectionRow, type: 'WRITE_OFF', amount: '5000.00', target_invoice_id: null },
      ]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ status: 'REQUESTED' }])
        .mockResolvedValueOnce([{ sum: '1000.00' }]); // only owes 1000 now

      await expect(service.approve('corr-1', 'owner-1', {})).rejects.toThrow(BadRequestException);
      expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
    });
  });
});
