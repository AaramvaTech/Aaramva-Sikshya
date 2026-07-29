import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BillPaymentService } from '../bill-payment.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { LedgerService } from '../ledger.service';
import { FinanceSettingsService } from '../finance-settings.service';
import { Role } from '../../common/enums/role.enum';
import { Money } from '../../../common/money/money';
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
            reverseInTx: jest.fn(),
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

  describe('recordPayment — CHEQUE (PENDING, no ledger entry)', () => {
    it('records a PENDING cheque payment: allocations inserted, status PENDING, no ledger entry', async () => {
      mockExistenceChecks();
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ id: 'invoice-1', outstanding: '8500.00' }]) // AUTO_FIFO candidates
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
        .mockResolvedValueOnce([{ status: 'CLEARED' }])
        .mockResolvedValueOnce([{ id: 'ledger-entry-1', student_id: 'student-1', academic_year_id: 'year-1', entry_type: 'PAYMENT', debit: '0.00', credit: '5000.00', narration: 'Payment RCPT-1' }])
        .mockResolvedValueOnce([{ bill_invoice_id: 'invoice-1' }])
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-1', status: 'VOIDED' }])
        .mockResolvedValueOnce([]);
      ledgerService.reverseInTx.mockResolvedValueOnce({ id: 'ledger-entry-void-reversal' } as any);

      const result = await service.voidPayment('payment-1', { reason: 'data entry error' }, 'owner-1');

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
        .mockResolvedValueOnce([{ status: 'PENDING' }])
        .mockResolvedValueOnce([{ bill_invoice_id: 'invoice-1' }])
        .mockResolvedValueOnce([{ ...mockPaymentRow, id: 'payment-2', status: 'VOIDED' }])
        .mockResolvedValueOnce([]);

      const result = await service.voidPayment('payment-2', {}, 'owner-1');

      expect(ledgerService.reverseInTx).not.toHaveBeenCalled();
      expect(result.status).toBe('VOIDED');
    });

    it('rejects voiding an already-VOIDED payment', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockPaymentRow, status: 'VOIDED' }]);
      await expect(service.voidPayment('payment-1', {}, 'owner-1')).rejects.toThrow(ConflictException);
    });

    it('rejects voiding an already-BOUNCED payment', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockPaymentRow, status: 'BOUNCED' }]);
      await expect(service.voidPayment('payment-1', {}, 'owner-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('recordPaymentInTx — callable directly with resolved params, bypassing recordPayment\'s own validation', () => {
    it('records an ESEWA payment (a method recordPayment() itself would reject) when called directly, without acquiring its own lock', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ id: 'invoice-1', outstanding: '5000.00' }]) // fetchInvoicesByIds (MANUAL target)
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
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([mockPaymentRow])
        .mockResolvedValueOnce([]); // guardians lookup: no match
      await expect(service.findOne('payment-1', 'parent-1', Role.PARENT)).rejects.toThrow(ForbiddenException);
    });
  });
});
