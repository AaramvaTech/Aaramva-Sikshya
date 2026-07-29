import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BillPaymentService } from '../bill-payment.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { LedgerService } from '../ledger.service';
import { FinanceSettingsService } from '../finance-settings.service';
import { Role } from '../../common/enums/role.enum';
import { BillPaymentAllocationMode, BillPaymentMethod, CreateBillPaymentDto } from '../dto/bill-payment.dto';

const mockTx = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

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
          },
        },
        { provide: FinanceSettingsService, useValue: { getInvoiceNumberingReset: jest.fn() } },
      ],
    }).compile();

    service = module.get(BillPaymentService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    ledgerService = module.get(LedgerService) as jest.Mocked<LedgerService>;
    financeSettingsService = module.get(FinanceSettingsService) as jest.Mocked<FinanceSettingsService>;
    jest.clearAllMocks();
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
        .mockResolvedValueOnce([{ id: 'invoice-1', outstanding: '8500.00' }]) // unpaid invoices, oldest-first
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
          { id: 'invoice-1', outstanding: '2000.00' },
          { id: 'invoice-2', outstanding: '3000.00' },
          { id: 'invoice-3', outstanding: '1500.00' },
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
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'invoice-1', outstanding: '1000.00' }]);

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
        { id: 'invoice-1', outstanding: '3000.00' },
        { id: 'invoice-2', outstanding: '3000.00' },
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

  describe('findOne — PARENT object-scoping', () => {
    it('403s a PARENT who does not own the payment student', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([mockPaymentRow])
        .mockResolvedValueOnce([]); // guardians lookup: no match
      await expect(service.findOne('payment-1', 'parent-1', Role.PARENT)).rejects.toThrow(ForbiddenException);
    });
  });
});
