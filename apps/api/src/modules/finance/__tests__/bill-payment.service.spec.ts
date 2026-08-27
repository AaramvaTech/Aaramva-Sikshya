import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BillPaymentService } from '../bill-payment.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { LedgerService } from '../ledger.service';
import { FinanceSettingsService } from '../finance-settings.service';
import { BillFineService } from '../bill-fine.service';
import { Role } from '../../common/enums/role.enum';
import { GuardianScopeService } from '../../student/guardian-scope.service';
import { Money } from '../../../common/money/money';
import { BillPaymentAllocationMode, BillPaymentMethod, CreateBillPaymentDto } from '../dto/bill-payment.dto';
import { guardSurvivingMocks } from '../../../testing/mock-leak-guard';

const mockTx = guardSurvivingMocks({
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
});

const mockPaymentRow = {
  id: 'payment-1',
  receipt_number: 'RCPT-2083-000001',
  student_id: 'student-1',
  academic_year_id: 'year-1',
  amount: '5000.00',
  method: 'CASH',
  status: 'CLEARED',
  received_date: new Date('2026-07-29'),
  received_bs_year: 2083, received_bs_month: 4, received_bs_day: 14,
  reference: null, cheque_bank: null, cheque_date: null,
  allocation_mode: 'AUTO_FIFO',
  ledger_entry_id: 'ledger-entry-1',
  gateway_txn_ref: null, notes: null,
  received_by: 'user-1',
  created_at: new Date('2026-07-29'), updated_at: new Date('2026-07-29'), deleted_at: null,
};

function baseDto(overrides: Partial<CreateBillPaymentDto> = {}): CreateBillPaymentDto {
  return {
    studentId: 'student-1',
    academicYearId: 'year-1',
    amount: '5000.00',
    method: BillPaymentMethod.CASH,
    allocationMode: BillPaymentAllocationMode.AUTO_FIFO,
    ...overrides,
  } as CreateBillPaymentDto;
}

describe('BillPaymentService', () => {
  let service: BillPaymentService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let ledgerService: jest.Mocked<LedgerService>;
  let financeSettingsService: jest.Mocked<FinanceSettingsService>;
  let guardianScope: jest.Mocked<GuardianScopeService>;
  let billFineService: jest.Mocked<BillFineService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BillPaymentService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
        { provide: TenantContextService, useValue: { getOrThrow: () => ({ tenantId: 't-1', slug: 'demo', schemaName: 'tenant_demo' }) } },
        {
          provide: LedgerService,
          useValue: {
            withStudentLock: jest.fn().mockImplementation((_studentId: string, fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
            postEntryInTx: jest.fn(),
            reverseInTx: jest.fn(),
          },
        },
        { provide: FinanceSettingsService, useValue: { getInvoiceNumberingReset: jest.fn() } },
        { provide: GuardianScopeService, useValue: { assertOwnsStudent: jest.fn() } },
        // BILL-7 checkout fix: fetchOutstandingAccruals defaults to "no
        // outstanding fines" so every pre-existing test (none of which knows
        // about fines) keeps its original AUTO_FIFO/MANUAL behavior — only
        // the new BILL-7 tests below override this per-case.
        { provide: BillFineService, useValue: { fetchOutstandingAccruals: jest.fn().mockResolvedValue([]) } },
      ],
    }).compile();

    service = module.get(BillPaymentService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    ledgerService = module.get(LedgerService) as jest.Mocked<LedgerService>;
    financeSettingsService = module.get(FinanceSettingsService) as jest.Mocked<FinanceSettingsService>;
    guardianScope = module.get(GuardianScopeService) as jest.Mocked<GuardianScopeService>;
    billFineService = module.get(BillFineService) as jest.Mocked<BillFineService>;
    jest.clearAllMocks();
    billFineService.fetchOutstandingAccruals.mockResolvedValue([]);
    financeSettingsService.getInvoiceNumberingReset.mockResolvedValue({ invoiceNumberingReset: false });
  });

  function mockExistenceChecks() {
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ id: 'student-1' }]) // student exists
      .mockResolvedValueOnce([{ id: 'year-1' }]);   // academic year exists
  }

  describe('recordPayment — validation', () => {
    it('404s when the student does not exist', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(service.recordPayment(baseDto(), 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('404s when the academic year does not exist', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'student-1' }])
        .mockResolvedValueOnce([]);
      await expect(service.recordPayment(baseDto(), 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('rejects non-CASH methods this checkpoint', async () => {
      mockExistenceChecks();
      await expect(
        service.recordPayment(baseDto({ method: BillPaymentMethod.BANK_TRANSFER }), 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a zero amount', async () => {
      mockExistenceChecks();
      await expect(service.recordPayment(baseDto({ amount: '0.00' }), 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects MANUAL mode with no targets', async () => {
      mockExistenceChecks();
      await expect(
        service.recordPayment(baseDto({ allocationMode: BillPaymentAllocationMode.MANUAL }), 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('recordPayment — the 8,500 -> 5,000 -> 3,500 invariant (AUTO_FIFO, single invoice)', () => {
    it('allocates the full amount to the one unpaid invoice, one PAYMENT ledger entry, zero remainder', async () => {
      mockExistenceChecks();
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ id: 'invoice-1', invoice_number: 'BINV-2083-000001', own_balance: '8500.00' }]) // unpaid invoices, oldest-first
        .mockResolvedValueOnce([{ value: BigInt(1) }]) // sequence upsert
        .mockResolvedValueOnce([{ id: 'payment-1' }]) // bill_payments insert RETURNING id
        .mockResolvedValueOnce([{ id: 'alloc-1', bill_payment_id: 'payment-1', bill_invoice_id: 'invoice-1', amount: '5000.00', created_at: new Date() }]) // allocations re-select
        .mockResolvedValueOnce([{ ...mockPaymentRow, amount: '5000.00' }]); // payment re-select

      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-1' } as any);

      const result = await service.recordPayment(baseDto({ amount: '5000.00' }), 'user-1');

      expect(ledgerService.withStudentLock).toHaveBeenCalledWith('student-1', expect.any(Function));
      expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({
        studentId: 'student-1', academicYearId: 'year-1', entryType: 'PAYMENT', debit: '0', credit: '5000.00',
      }));
      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bill_payment_allocations'),
        'payment-1', 'invoice-1', '5000.00',
      );
      expect(result.amount).toBe(5000);
      expect(result.allocatedAmount).toBe(5000);
      expect(result.advanceAmount).toBe(0);
    });
  });

  describe('recordPayment — FIFO across three invoices', () => {
    it('settles the two oldest fully, partial on the boundary invoice, leaves the newest untouched', async () => {
      mockExistenceChecks();
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([
          { id: 'invoice-1', invoice_number: 'BINV-2083-000001', own_balance: '2000.00' },
          { id: 'invoice-2', invoice_number: 'BINV-2083-000002', own_balance: '3000.00' },
          { id: 'invoice-3', invoice_number: 'BINV-2083-000003', own_balance: '1500.00' },
        ])
        .mockResolvedValueOnce([{ value: BigInt(2) }])
        .mockResolvedValueOnce([{ id: 'payment-2' }])
        .mockResolvedValueOnce([
          { id: 'alloc-1', bill_payment_id: 'payment-2', bill_invoice_id: 'invoice-1', amount: '2000.00', created_at: new Date() },
          { id: 'alloc-2', bill_payment_id: 'payment-2', bill_invoice_id: 'invoice-2', amount: '2500.00', created_at: new Date() },
        ])
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-2', amount: '4500.00' }]);

      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-2' } as any);

      const result = await service.recordPayment(baseDto({ amount: '4500.00' }), 'user-1');

      expect(result.allocations).toHaveLength(2);
      expect(result.allocatedAmount).toBe(4500);
      expect(result.advanceAmount).toBe(0);
      // invoice-3 never touched
      expect(mockTx.$executeRawUnsafe).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bill_payment_allocations'),
        'payment-2', 'invoice-3', expect.anything(),
      );
    });
  });

  describe('recordPayment — ADVANCE_ONLY', () => {
    it('creates zero allocations and a DEPOSIT ledger entry', async () => {
      mockExistenceChecks();
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ value: BigInt(3) }]) // sequence upsert (no unpaid-invoice query for ADVANCE_ONLY)
        .mockResolvedValueOnce([{ id: 'payment-3' }])
        .mockResolvedValueOnce([]) // allocations re-select: empty
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-3', allocation_mode: 'ADVANCE_ONLY', amount: '2000.00' }]);

      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-3' } as any);

      const result = await service.recordPayment(
        baseDto({ amount: '2000.00', allocationMode: BillPaymentAllocationMode.ADVANCE_ONLY }), 'user-1',
      );

      expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({ entryType: 'DEPOSIT', credit: '2000.00' }));
      expect(result.allocations).toEqual([]);
      expect(result.advanceAmount).toBe(2000);
    });
  });

  describe('recordPayment — MANUAL over-allocation rejected', () => {
    it('rejects a target amount exceeding that invoice outstanding balance', async () => {
      mockExistenceChecks();
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'invoice-1', invoice_number: 'BINV-2083-000001', own_balance: '1000.00' }]);

      await expect(
        service.recordPayment(
          baseDto({
            amount: '5000.00',
            allocationMode: BillPaymentAllocationMode.MANUAL,
            targets: [{ billInvoiceId: 'invoice-1', amount: '2000.00' }],
          }),
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when the sum of targets exceeds the payment amount', async () => {
      mockExistenceChecks();
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([
        { id: 'invoice-1', invoice_number: 'BINV-2083-000001', own_balance: '3000.00' },
        { id: 'invoice-2', invoice_number: 'BINV-2083-000002', own_balance: '3000.00' },
      ]);

      await expect(
        service.recordPayment(
          baseDto({
            amount: '1000.00',
            allocationMode: BillPaymentAllocationMode.MANUAL,
            targets: [
              { billInvoiceId: 'invoice-1', amount: '600.00' },
              { billInvoiceId: 'invoice-2', amount: '600.00' },
            ],
          }),
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // BILL-7 checkout fix — late fees had no payable target anywhere in the
  // allocation model before this. Priority: invoices first (oldest-first,
  // unchanged), then whatever remains goes to outstanding fines.
  describe('recordPayment — BILL-7 fine allocation (AUTO_FIFO)', () => {
    it('settles the invoice in full, remainder goes to the outstanding fine — Binod Gurung worked example (2260 invoice + 40 fine)', async () => {
      mockExistenceChecks();
      billFineService.fetchOutstandingAccruals.mockResolvedValueOnce([
        { id: 'fine-1', bill_invoice_id: 'invoice-1', invoice_number: 'BINV-2083-000005', accrued_through: '2026-08-16', days_overdue: 4, outstanding: '40.00' },
      ]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ id: 'invoice-1', invoice_number: 'BINV-2083-000005', own_balance: '2260.00' }]) // unpaid invoices
        .mockResolvedValueOnce([{ value: BigInt(6) }]) // sequence upsert
        .mockResolvedValueOnce([{ id: 'payment-6' }]) // bill_payments insert
        .mockResolvedValueOnce([
          { id: 'alloc-1', bill_payment_id: 'payment-6', bill_invoice_id: 'invoice-1', bill_fine_accrual_id: null, amount: '2260.00', created_at: new Date() },
          { id: 'alloc-2', bill_payment_id: 'payment-6', bill_invoice_id: null, bill_fine_accrual_id: 'fine-1', amount: '40.00', created_at: new Date() },
        ]) // allocations re-select
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-6', amount: '2300.00' }]); // payment re-select
      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-6' } as any);

      const result = await service.recordPayment(baseDto({ amount: '2300.00' }), 'user-1');

      expect(billFineService.fetchOutstandingAccruals).toHaveBeenCalledWith(mockTx, 'student-1');
      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bill_payment_allocations (bill_payment_id, bill_invoice_id, amount)'),
        'payment-6', 'invoice-1', '2260.00',
      );
      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bill_payment_allocations (bill_payment_id, bill_fine_accrual_id, amount)'),
        'payment-6', 'fine-1', '40.00',
      );
      expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({
        entryType: 'PAYMENT', credit: '2300.00',
      }));
      expect(result.allocatedAmount).toBe(2300);
      expect(result.advanceAmount).toBe(0);
    });

    it('never queries fines when invoices exactly consume the payment (zero remainder) — invoices strictly first', async () => {
      mockExistenceChecks();
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ id: 'invoice-1', invoice_number: 'BINV-2083-000005', own_balance: '2260.00' }])
        .mockResolvedValueOnce([{ value: BigInt(7) }])
        .mockResolvedValueOnce([{ id: 'payment-7' }])
        .mockResolvedValueOnce([{ id: 'alloc-1', bill_payment_id: 'payment-7', bill_invoice_id: 'invoice-1', bill_fine_accrual_id: null, amount: '2260.00', created_at: new Date() }])
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-7', amount: '2260.00' }]);
      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-7' } as any);

      await service.recordPayment(baseDto({ amount: '2260.00' }), 'user-1');

      expect(billFineService.fetchOutstandingAccruals).not.toHaveBeenCalled();
    });

    it('no outstanding invoices at all — the whole payment goes to the outstanding fine', async () => {
      mockExistenceChecks();
      billFineService.fetchOutstandingAccruals.mockResolvedValueOnce([
        { id: 'fine-1', bill_invoice_id: 'invoice-1', invoice_number: 'BINV-2083-000005', accrued_through: '2026-08-16', days_overdue: 4, outstanding: '40.00' },
      ]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([]) // no unpaid invoices
        .mockResolvedValueOnce([{ value: BigInt(8) }])
        .mockResolvedValueOnce([{ id: 'payment-8' }])
        .mockResolvedValueOnce([{ id: 'alloc-1', bill_payment_id: 'payment-8', bill_invoice_id: null, bill_fine_accrual_id: 'fine-1', amount: '40.00', created_at: new Date() }])
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-8', amount: '40.00' }]);
      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-8' } as any);

      const result = await service.recordPayment(baseDto({ amount: '40.00' }), 'user-1');

      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bill_payment_allocations (bill_payment_id, bill_fine_accrual_id, amount)'),
        'payment-8', 'fine-1', '40.00',
      );
      // Even a fine-only payment is a real PAYMENT, not unattributed advance
      // credit (DEPOSIT) — money was applied to something specific.
      expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({ entryType: 'PAYMENT' }));
      expect(result.allocatedAmount).toBe(40);
    });
  });

  describe('recordPayment — BILL-7 fine allocation (MANUAL)', () => {
    it('targets a fine accrual specifically', async () => {
      mockExistenceChecks();
      billFineService.fetchOutstandingAccruals.mockResolvedValueOnce([
        { id: 'fine-1', bill_invoice_id: 'invoice-1', invoice_number: 'BINV-2083-000005', accrued_through: '2026-08-16', days_overdue: 4, outstanding: '40.00' },
      ]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ value: BigInt(9) }])
        .mockResolvedValueOnce([{ id: 'payment-9' }])
        .mockResolvedValueOnce([{ id: 'alloc-1', bill_payment_id: 'payment-9', bill_invoice_id: null, bill_fine_accrual_id: 'fine-1', amount: '40.00', created_at: new Date() }])
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-9', amount: '40.00' }]);
      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-9' } as any);

      const result = await service.recordPayment(
        baseDto({
          amount: '40.00',
          allocationMode: BillPaymentAllocationMode.MANUAL,
          targets: [{ billFineAccrualId: 'fine-1', amount: '40.00' }],
        }),
        'user-1',
      );

      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bill_payment_allocations (bill_payment_id, bill_fine_accrual_id, amount)'),
        'payment-9', 'fine-1', '40.00',
      );
      expect(result.allocatedAmount).toBe(40);
    });

    it('rejects a target amount exceeding that fine accrual\'s own outstanding amount', async () => {
      mockExistenceChecks();
      billFineService.fetchOutstandingAccruals.mockResolvedValueOnce([
        { id: 'fine-1', bill_invoice_id: 'invoice-1', invoice_number: 'BINV-2083-000005', accrued_through: '2026-08-16', days_overdue: 4, outstanding: '40.00' },
      ]);

      await expect(
        service.recordPayment(
          baseDto({
            amount: '100.00',
            allocationMode: BillPaymentAllocationMode.MANUAL,
            targets: [{ billFineAccrualId: 'fine-1', amount: '100.00' }],
          }),
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a fine id that is not outstanding for this student (foreign, already-paid, or reversed)', async () => {
      mockExistenceChecks();
      billFineService.fetchOutstandingAccruals.mockResolvedValueOnce([]); // nothing outstanding

      await expect(
        service.recordPayment(
          baseDto({
            amount: '40.00',
            allocationMode: BillPaymentAllocationMode.MANUAL,
            targets: [{ billFineAccrualId: 'fine-does-not-exist', amount: '40.00' }],
          }),
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a target naming neither billInvoiceId nor billFineAccrualId', async () => {
      mockExistenceChecks();
      // Neither id is set, so invoiceIds/fineIds are both empty — both
      // fetchInvoicesByIds and fetchFinesByIds short-circuit without
      // touching mockTx or billFineService at all; the rejection comes
      // purely from the per-target validation loop.

      await expect(
        service.recordPayment(
          baseDto({
            amount: '40.00',
            allocationMode: BillPaymentAllocationMode.MANUAL,
            targets: [{ amount: '40.00' } as any],
          }),
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a target naming BOTH billInvoiceId and billFineAccrualId', async () => {
      mockExistenceChecks();
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'invoice-1', invoice_number: 'BINV-2083-000005', own_balance: '2260.00' }]);
      billFineService.fetchOutstandingAccruals.mockResolvedValueOnce([
        { id: 'fine-1', bill_invoice_id: 'invoice-1', invoice_number: 'BINV-2083-000005', accrued_through: '2026-08-16', days_overdue: 4, outstanding: '40.00' },
      ]);

      await expect(
        service.recordPayment(
          baseDto({
            amount: '40.00',
            allocationMode: BillPaymentAllocationMode.MANUAL,
            targets: [{ billInvoiceId: 'invoice-1', billFineAccrualId: 'fine-1', amount: '40.00' } as any],
          }),
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('mixes an invoice target and a fine target in one payment', async () => {
      mockExistenceChecks();
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ id: 'invoice-1', invoice_number: 'BINV-2083-000005', own_balance: '2260.00' }]) // fetchInvoicesByIds
        .mockResolvedValueOnce([{ value: BigInt(10) }])
        .mockResolvedValueOnce([{ id: 'payment-10' }])
        .mockResolvedValueOnce([
          { id: 'alloc-1', bill_payment_id: 'payment-10', bill_invoice_id: 'invoice-1', bill_fine_accrual_id: null, amount: '2260.00', created_at: new Date() },
          { id: 'alloc-2', bill_payment_id: 'payment-10', bill_invoice_id: null, bill_fine_accrual_id: 'fine-1', amount: '40.00', created_at: new Date() },
        ])
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-10', amount: '2300.00' }]);
      billFineService.fetchOutstandingAccruals.mockResolvedValueOnce([
        { id: 'fine-1', bill_invoice_id: 'invoice-1', invoice_number: 'BINV-2083-000005', accrued_through: '2026-08-16', days_overdue: 4, outstanding: '40.00' },
      ]);
      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-10' } as any);

      const result = await service.recordPayment(
        baseDto({
          amount: '2300.00',
          allocationMode: BillPaymentAllocationMode.MANUAL,
          targets: [
            { billInvoiceId: 'invoice-1', amount: '2260.00' },
            { billFineAccrualId: 'fine-1', amount: '40.00' },
          ],
        }),
        'user-1',
      );

      expect(result.allocatedAmount).toBe(2300);
      expect(result.advanceAmount).toBe(0);
    });
  });

  describe('recordPayment — CHEQUE (PENDING, no ledger entry)', () => {
    it('records a PENDING cheque payment: allocations inserted, status PENDING, no ledger entry', async () => {
      mockExistenceChecks();
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ id: 'invoice-1', invoice_number: 'BINV-2083-000001', own_balance: '8500.00' }]) // AUTO_FIFO candidates
        .mockResolvedValueOnce([{ value: BigInt(5) }]) // sequence upsert
        .mockResolvedValueOnce([{ id: 'payment-cheque-1' }]) // bill_payments insert
        .mockResolvedValueOnce([{ id: 'alloc-1', bill_payment_id: 'payment-cheque-1', bill_invoice_id: 'invoice-1', amount: '5000.00', created_at: new Date() }])
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-cheque-1', method: 'CHEQUE', status: 'PENDING', amount: '5000.00', ledger_entry_id: null }]);

      const result = await service.recordPayment(
        baseDto({
          amount: '5000.00', method: BillPaymentMethod.CHEQUE,
          reference: 'CHQ-001', chequeBank: 'Nepal Bank', chequeDate: '2026-07-29',
        }),
        'user-1',
      );

      expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bill_payment_allocations'),
        'payment-cheque-1', 'invoice-1', '5000.00',
      );
      expect(result.status).toBe('PENDING');
      expect(result.ledgerEntryId).toBeNull();
    });

    it('rejects a CHEQUE payment missing chequeBank/chequeDate', async () => {
      mockExistenceChecks();
      await expect(
        service.recordPayment(baseDto({ method: BillPaymentMethod.CHEQUE, reference: 'CHQ-002' }), 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateChequeStatus — PENDING -> CLEARED', () => {
    it('posts the deferred ledger entry now, sets cleared_at/cleared_by, recomputes invoice status', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
        ...mockPaymentRow, id: 'payment-cheque-1', method: 'CHEQUE', status: 'PENDING',
        academic_year_id: 'year-1', amount: '5000.00', ledger_entry_id: null,
      }]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ status: 'PENDING' }]) // re-check under lock
        .mockResolvedValueOnce([{ bill_invoice_id: 'invoice-1' }]) // this payment's allocations
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-cheque-1', method: 'CHEQUE', status: 'CLEARED' }]) // re-select payment
        .mockResolvedValueOnce([]); // re-select allocations
      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-cleared' } as any);

      const result = await service.updateChequeStatus('payment-cheque-1', { status: 'CLEARED' }, 'owner-1');

      expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({
        studentId: 'student-1', academicYearId: 'year-1', debit: '0', credit: '5000.00',
      }));
      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE bill_payments SET status = \'CLEARED\''),
        'payment-cheque-1', 'ledger-entry-cleared', 'owner-1',
      );
      expect(result.status).toBe('CLEARED');
    });
  });

  describe('updateChequeStatus — PENDING -> BOUNCED', () => {
    it('flips status, records bounce audit, posts no ledger entry (none ever existed)', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
        ...mockPaymentRow, id: 'payment-cheque-2', method: 'CHEQUE', status: 'PENDING', ledger_entry_id: null,
      }]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ status: 'PENDING' }])
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-cheque-2', method: 'CHEQUE', status: 'BOUNCED' }])
        .mockResolvedValueOnce([]);

      const result = await service.updateChequeStatus('payment-cheque-2', { status: 'BOUNCED', reason: 'insufficient funds' }, 'owner-1');

      expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
      expect(ledgerService.reverseInTx).not.toHaveBeenCalled();
      expect(result.status).toBe('BOUNCED');
    });
  });

  describe('updateChequeStatus — CLEARED -> BOUNCED (rare, after clearing)', () => {
    it('appends a reversing ledger entry via reverseInTx, does not touch the original entry', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
        ...mockPaymentRow, id: 'payment-cheque-3', method: 'CHEQUE', status: 'CLEARED', ledger_entry_id: 'ledger-entry-x',
      }]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ status: 'CLEARED' }])
        .mockResolvedValueOnce([{ id: 'ledger-entry-x', student_id: 'student-1', academic_year_id: 'year-1', entry_type: 'PAYMENT', debit: '0.00', credit: '5000.00', narration: 'Payment RCPT-1' }])
        .mockResolvedValueOnce([{ bill_invoice_id: 'invoice-1' }])
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-cheque-3', method: 'CHEQUE', status: 'BOUNCED' }])
        .mockResolvedValueOnce([]);
      ledgerService.reverseInTx.mockResolvedValueOnce({ id: 'ledger-entry-reversal' } as any);

      const result = await service.updateChequeStatus('payment-cheque-3', { status: 'BOUNCED', reason: 'bank reversal' }, 'owner-1');

      expect(ledgerService.reverseInTx).toHaveBeenCalledWith(
        mockTx, expect.objectContaining({ id: 'ledger-entry-x' }), 'owner-1',
      );
      expect(result.status).toBe('BOUNCED');
    });
  });

  describe('updateChequeStatus — invalid transitions rejected', () => {
    it('rejects a non-CHEQUE payment', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockPaymentRow, method: 'CASH' }]);
      await expect(service.updateChequeStatus('payment-1', { status: 'CLEARED' }, 'owner-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects transitioning an already-BOUNCED cheque', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockPaymentRow, method: 'CHEQUE', status: 'BOUNCED' }]);
      await expect(service.updateChequeStatus('payment-1', { status: 'CLEARED' }, 'owner-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('voidPayment', () => {
    it('reverses a CLEARED payment via reverseInTx and marks it VOIDED', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
        ...mockPaymentRow, id: 'payment-1', status: 'CLEARED', ledger_entry_id: 'ledger-entry-1',
      }]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-1', status: 'CLEARED', ledger_entry_id: 'ledger-entry-1' }]) // locked re-read
        .mockResolvedValueOnce([{ id: 'ledger-entry-1', student_id: 'student-1', academic_year_id: 'year-1', entry_type: 'PAYMENT', debit: '0.00', credit: '5000.00', narration: 'Payment RCPT-1' }])
        .mockResolvedValueOnce([{ bill_invoice_id: 'invoice-1' }])
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-1', status: 'VOIDED' }])
        .mockResolvedValueOnce([]);
      ledgerService.reverseInTx.mockResolvedValueOnce({ id: 'ledger-entry-void-reversal' } as any);

      const result = await service.voidPayment('payment-1', { reason: 'data entry error' }, 'owner-1');

      expect(mockTx.$queryRawUnsafe).toHaveBeenNthCalledWith(
        1, expect.stringContaining('FOR UPDATE'), 'payment-1',
      );
      expect(ledgerService.reverseInTx).toHaveBeenCalledWith(
        mockTx, expect.objectContaining({ id: 'ledger-entry-1' }), 'owner-1',
      );
      expect(result.status).toBe('VOIDED');
    });

    it('voids a PENDING payment with no ledger reversal (nothing was ever posted)', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
        ...mockPaymentRow, id: 'payment-2', status: 'PENDING', ledger_entry_id: null,
      }]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-2', status: 'PENDING', ledger_entry_id: null }]) // locked re-read
        .mockResolvedValueOnce([{ bill_invoice_id: 'invoice-1' }])
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-2', status: 'VOIDED' }])
        .mockResolvedValueOnce([]);

      const result = await service.voidPayment('payment-2', {}, 'owner-1');

      expect(ledgerService.reverseInTx).not.toHaveBeenCalled();
      expect(result.status).toBe('VOIDED');
    });

    it('rejects voiding an already-VOIDED payment (fast-fail, pre-lock)', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockPaymentRow, status: 'VOIDED' }]);
      await expect(service.voidPayment('payment-1', {}, 'owner-1')).rejects.toThrow(ConflictException);
    });

    it('rejects voiding an already-BOUNCED payment (fast-fail, pre-lock)', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockPaymentRow, status: 'BOUNCED' }]);
      await expect(service.voidPayment('payment-1', {}, 'owner-1')).rejects.toThrow(BadRequestException);
    });

    it('D20-VOID-TOCTOU: rejects when the LOCKED re-read shows VOIDED even though the pre-lock fetch saw CLEARED (a concurrent void won the race)', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
        ...mockPaymentRow, id: 'payment-1', status: 'CLEARED', ledger_entry_id: 'ledger-entry-1',
      }]);
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-1', status: 'VOIDED' }]);

      await expect(service.voidPayment('payment-1', {}, 'owner-1')).rejects.toThrow(ConflictException);
      expect(ledgerService.reverseInTx).not.toHaveBeenCalled();
    });

    it('D20-VOID-TOCTOU: the regression — a payment that goes PENDING -> CLEARED (gaining a ledger_entry_id) between the pre-lock fetch and the lock is still reversed, not silently skipped', async () => {
      // Pre-lock fetch: still PENDING, no ledger entry yet — this is the stale
      // snapshot that must NOT be trusted for the reversal decision.
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
        ...mockPaymentRow, id: 'payment-3', status: 'PENDING', ledger_entry_id: null,
      }]);
      // Locked re-read: a concurrent updateChequeStatus(PENDING -> CLEARED)
      // committed in the window before this transaction's lock was acquired —
      // the row is now CLEARED and carries a real ledger_entry_id.
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-3', status: 'CLEARED', ledger_entry_id: 'ledger-entry-late' }])
        .mockResolvedValueOnce([{ id: 'ledger-entry-late', student_id: 'student-1', academic_year_id: 'year-1', entry_type: 'PAYMENT', debit: '0.00', credit: '5000.00', narration: 'Payment RCPT-1' }])
        .mockResolvedValueOnce([{ bill_invoice_id: 'invoice-1' }])
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-3', status: 'VOIDED' }])
        .mockResolvedValueOnce([]);
      ledgerService.reverseInTx.mockResolvedValueOnce({ id: 'ledger-entry-void-reversal' } as any);

      const result = await service.voidPayment('payment-3', {}, 'owner-1');

      // Before the fix, this branch tested current.status (fresh: CLEARED)
      // but read payment.ledger_entry_id (stale: null) — the && short-circuited
      // and reverseInTx was never called, leaving the ledger credit standing
      // on a payment now marked VOIDED.
      expect(ledgerService.reverseInTx).toHaveBeenCalledWith(
        mockTx, expect.objectContaining({ id: 'ledger-entry-late' }), 'owner-1',
      );
      expect(result.status).toBe('VOIDED');
    });
  });


  /**
   * ALLOCATION-CAP-1 (BILLING-CALC-AUDIT-1 Ruling 3). An allocation means
   * "money applied to THIS invoice", bounded by its own charge (net_amount).
   * Before the cap, a payment against an invoice carrying a previous balance
   * booked the whole total_receivable against that one invoice — over-booking
   * it while the prior months it swallowed stayed separately payable. 8 of 32
   * allocations on the dev DB breach it, across CASH, MANUAL and ESEWA.
   */
  describe('ALLOCATION-CAP-1 — allocations are bounded by the invoice own charge', () => {
    // One shape reused below, from the confirmed live case: BINV-…000004 has
    // an own charge of 2,260 and carries 2,000 of arrears (total_receivable
    // 4,260). Only the 2,260 may ever be booked against it.
    const OWN_CHARGE = '2260.00';

    it('a payment exactly equal to the own balance allocates in full, nothing left over', async () => {
      mockExistenceChecks();
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ id: 'invoice-4', invoice_number: 'BINV-2083-000004', own_balance: OWN_CHARGE }])
        .mockResolvedValueOnce([{ value: BigInt(11) }])
        .mockResolvedValueOnce([{ id: 'payment-cap-1' }])
        .mockResolvedValueOnce([{ id: 'alloc-1', bill_payment_id: 'payment-cap-1', bill_invoice_id: 'invoice-4', amount: OWN_CHARGE, created_at: new Date() }])
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-cap-1', amount: OWN_CHARGE }]);
      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-cap-1' } as any);

      const result = await service.recordPayment(baseDto({ amount: OWN_CHARGE }), 'user-1');

      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bill_payment_allocations'),
        'payment-cap-1', 'invoice-4', OWN_CHARGE,
      );
      expect(result.allocatedAmount).toBe(2260);
      expect(result.advanceAmount).toBe(0);
      // PAYMENT, not DEPOSIT — it landed on an invoice.
      expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({
        entryType: 'PAYMENT', credit: OWN_CHARGE,
      }));
    });

    it('a payment exceeding the own balance books only the own charge — the surplus becomes unallocated credit', async () => {
      // The confirmed live overcharge: 4,260 taken against an invoice whose
      // own charge is 2,260. Pre-cap all 4,260 was booked here, and
      // BINV-…000002 stayed payable for the 2,000 already collected.
      mockExistenceChecks();
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ id: 'invoice-4', invoice_number: 'BINV-2083-000004', own_balance: OWN_CHARGE }])
        .mockResolvedValueOnce([{ value: BigInt(12) }])
        .mockResolvedValueOnce([{ id: 'payment-cap-2' }])
        .mockResolvedValueOnce([{ id: 'alloc-1', bill_payment_id: 'payment-cap-2', bill_invoice_id: 'invoice-4', amount: OWN_CHARGE, created_at: new Date() }])
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-cap-2', amount: '4260.00' }]);
      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-cap-2' } as any);

      const result = await service.recordPayment(baseDto({ amount: '4260.00' }), 'user-1');

      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bill_payment_allocations'),
        'payment-cap-2', 'invoice-4', OWN_CHARGE,
      );
      // Exactly one allocation, and it is NOT the whole payment.
      const allocInserts = mockTx.$executeRawUnsafe.mock.calls
        .filter((c: unknown[]) => String(c[0]).includes('INSERT INTO bill_payment_allocations'));
      expect(allocInserts).toHaveLength(1);
      expect(allocInserts[0][3]).not.toBe('4260.00');

      expect(result.allocatedAmount).toBe(2260);
      expect(result.advanceAmount).toBe(2000); // the surplus, held as credit
      // The student's position stays correct: the ledger is credited the full
      // amount received; only the allocation is bounded.
      expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({
        credit: '4260.00',
      }));
    });

    it('a payment against an invoice with zero own balance books nothing against it — the whole payment is credit', async () => {
      // Already fully allocated: the HAVING in fetchUnpaidInvoicesOldestFirst
      // leaves it out of the candidate list entirely, so there is no invoice
      // to over-book and the payment lands as a DEPOSIT.
      mockExistenceChecks();
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([]) // no candidate has own balance left
        .mockResolvedValueOnce([{ value: BigInt(13) }])
        .mockResolvedValueOnce([{ id: 'payment-cap-3' }])
        .mockResolvedValueOnce([]) // allocations re-select: none
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-cap-3', amount: '2000.00' }]);
      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-cap-3' } as any);

      const result = await service.recordPayment(baseDto({ amount: '2000.00' }), 'user-1');

      expect(mockTx.$executeRawUnsafe).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bill_payment_allocations'),
        expect.anything(), expect.anything(), expect.anything(),
      );
      expect(result.allocations).toEqual([]);
      expect(result.advanceAmount).toBe(2000);
      expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({
        entryType: 'DEPOSIT', credit: '2000.00',
      }));
    });

    it('MANUAL rejects a target above the invoice own charge, even when the payment covers it', async () => {
      // The cashier path — 2 of the 8 breaching invoices came through it.
      // Against total_receivable this 4,260 would have been accepted.
      mockExistenceChecks();
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([
        { id: 'invoice-4', invoice_number: 'BINV-2083-000004', own_balance: OWN_CHARGE },
      ]);

      await expect(
        service.recordPayment(
          baseDto({
            amount: '4260.00',
            allocationMode: BillPaymentAllocationMode.MANUAL,
            targets: [{ billInvoiceId: 'invoice-4', amount: '4260.00' }],
          }),
          'user-1',
        ),
      ).rejects.toThrow(/own outstanding charge of 2260\.00/);

      // The ceiling comes from SQL, not the message: pin the expression too.
      const sql = String(mockTx.$queryRawUnsafe.mock.calls[0][0]);
      expect(sql).toContain('bi.net_amount');
      expect(sql).not.toContain('total_receivable');
    });

    it('the FIFO candidate query reads net_amount and never total_receivable', async () => {
      // Every assertion above runs against mocked rows, so this is the one
      // that fails if the SQL itself regresses.
      mockExistenceChecks();
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ value: BigInt(14) }])
        .mockResolvedValueOnce([{ id: 'payment-cap-4' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-cap-4', amount: '100.00' }]);
      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-cap-4' } as any);

      await service.recordPayment(baseDto({ amount: '100.00' }), 'user-1');

      const sql = String(mockTx.$queryRawUnsafe.mock.calls[0][0]);
      expect(sql).toContain('bi.net_amount');
      expect(sql).not.toContain('total_receivable');
      // The capacity filter, not just the selected column — a HAVING left on
      // total_receivable would still admit an over-booked invoice as a
      // candidate with room it does not have.
      expect(sql).toContain('HAVING bi.net_amount - COALESCE(SUM(bpa.amount), 0) > 0');
    });

    it('settlement is judged against net_amount too, or SETTLED is unreachable for a carried-forward invoice', async () => {
      // Under the cap an invoice can never accumulate total_receivable worth
      // of allocations, so a status check left on total_receivable would pin
      // every carried-forward invoice at PARTIALLY_PAID with nothing left to
      // pay. The cap and this comparison have to move together.
      mockExistenceChecks();
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ id: 'invoice-4', invoice_number: 'BINV-2083-000004', own_balance: OWN_CHARGE }])
        .mockResolvedValueOnce([{ value: BigInt(15) }])
        .mockResolvedValueOnce([{ id: 'payment-cap-5' }])
        .mockResolvedValueOnce([{ id: 'alloc-1', bill_payment_id: 'payment-cap-5', bill_invoice_id: 'invoice-4', amount: OWN_CHARGE, created_at: new Date() }])
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-cap-5', amount: OWN_CHARGE }]);
      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-cap-5' } as any);

      await service.recordPayment(baseDto({ amount: OWN_CHARGE }), 'user-1');

      const statusCall = mockTx.$executeRawUnsafe.mock.calls
        .find((c: unknown[]) => String(c[0]).includes('status = CASE'));
      expect(statusCall).toBeDefined();
      expect(String(statusCall![0])).toContain('WHEN net_amount <=');
      expect(String(statusCall![0])).not.toContain('total_receivable');
    });
  });
  describe('recordPaymentInTx — callable directly with resolved params, bypassing recordPayment\'s own validation', () => {
    it('records an ESEWA payment (a method recordPayment() itself would reject) when called directly, without acquiring its own lock', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ id: 'invoice-1', invoice_number: 'BINV-2083-000001', own_balance: '5000.00' }]) // fetchInvoicesByIds (MANUAL target)
        .mockResolvedValueOnce([{ value: BigInt(9) }]) // sequence upsert
        .mockResolvedValueOnce([{ id: 'payment-esewa-1' }]) // bill_payments insert
        .mockResolvedValueOnce([{ id: 'alloc-1', bill_payment_id: 'payment-esewa-1', bill_invoice_id: 'invoice-1', amount: '5000.00', created_at: new Date() }])
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-esewa-1', method: 'ESEWA', amount: '5000.00' }]);
      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-esewa-1' } as any);

      const result = await service.recordPaymentInTx(mockTx as any, {
        studentId: 'student-1', academicYearId: 'year-1', amount: Money.fromDb('5000.00'),
        method: BillPaymentMethod.ESEWA, allocationMode: BillPaymentAllocationMode.MANUAL,
        targets: [{ billInvoiceId: 'invoice-1', amount: '5000.00' }],
        reference: 'esewa-ref-123',
      }, 'system');

      expect(result.method).toBe('ESEWA');
      expect(result.status).toBe('CLEARED');
      expect(ledgerService.withStudentLock).not.toHaveBeenCalled(); // no lock acquired by recordPaymentInTx itself
      expect(mockTx.$queryRawUnsafe).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('INSERT INTO bill_payments'),
        expect.anything(), 'student-1', 'year-1', '5000.00', 'ESEWA', 'CLEARED',
        expect.anything(), expect.anything(), expect.anything(), expect.anything(),
        'esewa-ref-123', null, null, 'MANUAL', null, 'system',
      );
    });

    it('records an ADVANCE_ONLY DEPOSIT when called directly with no targets', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ value: BigInt(10) }]) // sequence upsert (no candidate query for ADVANCE_ONLY)
        .mockResolvedValueOnce([{ id: 'payment-esewa-2' }])
        .mockResolvedValueOnce([]) // allocations re-select: empty
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-esewa-2', method: 'KHALTI', allocation_mode: 'ADVANCE_ONLY', amount: '1200.00' }]);
      ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-esewa-2' } as any);

      const result = await service.recordPaymentInTx(mockTx as any, {
        studentId: 'student-1', academicYearId: 'year-1', amount: Money.fromDb('1200.00'),
        method: BillPaymentMethod.KHALTI, allocationMode: BillPaymentAllocationMode.ADVANCE_ONLY,
        reference: 'khalti-pidx-abc',
      }, 'system');

      expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({ entryType: 'DEPOSIT', credit: '1200.00' }));
      expect(result.allocations).toEqual([]);
    });
  });

  describe('findOne — PARENT object-scoping', () => {
    it('403s a PARENT who does not own the payment student', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockPaymentRow]);
      guardianScope.assertOwnsStudent.mockRejectedValueOnce(new ForbiddenException());
      await expect(service.findOne('payment-1', 'parent-1', Role.PARENT)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll — receivedBy filter (UI-6 §2.2, cashier-shift payments drill-down)', () => {
    it('adds a received_by condition, bound as its own param, when receivedBy is passed', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockPaymentRow, total_count: '1' }]);

      const result = await service.findAll({ receivedBy: 'user-1' });

      expect(result.data).toHaveLength(1);
      expect(tenantPrisma.query).toHaveBeenCalledWith(
        expect.stringContaining('bp.received_by = $1::uuid'),
        'user-1', 20, 0,
      );
    });

    it('omits the received_by condition when not passed', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await service.findAll({});
      expect(tenantPrisma.query).toHaveBeenCalledWith(
        expect.not.stringContaining('received_by'),
        20, 0,
      );
    });

    it('combines with existing filters (studentId + receivedBy), each its own bound param', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await service.findAll({ studentId: 'student-1', receivedBy: 'user-1' });
      expect(tenantPrisma.query).toHaveBeenCalledWith(
        expect.stringContaining('bp.student_id = $1::uuid'),
        'student-1', 'user-1', 20, 0,
      );
    });
  });
});
