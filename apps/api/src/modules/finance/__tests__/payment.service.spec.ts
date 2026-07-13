import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaymentService } from '../payment.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { PaymentMethod } from '../dto/payment.dto';

const mockTx = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

const baseInvoiceRow = {
  id: 'inv-1',
  invoice_number: 'INV-2081-000001',
  student_id: 'student-1',
  academic_year_id: 'year-1',
  due_date: new Date('2025-07-15'),
  status: 'UNPAID',
  subtotal: '1000.00',
  discount_amount: '0.00',
  fine_amount: '0.00',
  total_amount: '1000.00',
  paid_amount: '0.00',
  balance: '1000.00',
  created_by: 'user-1',
  created_at: new Date('2025-07-01'),
  updated_at: new Date('2025-07-01'),
  deleted_at: null,
};

const basePaymentRow = {
  id: 'pay-1',
  payment_number: 'PAY-2081-000001',
  invoice_id: 'inv-1',
  student_id: 'student-1',
  amount: '1000.00',
  method: 'CASH',
  reference: null,
  notes: null,
  received_by: 'user-1',
  created_at: new Date('2025-07-15'),
  deleted_at: null,
};

describe('PaymentService', () => {
  let service: PaymentService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: TenantPrismaService,
          useValue: {
            run: jest.fn().mockImplementation((fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
            query: jest.fn(),
            execute: jest.fn(),
          },
        },
        {
          provide: TenantContextService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue({
              tenantId: 'tenant-1',
              slug: 'test-school',
              schemaName: 'tenant_test',
            }),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(PaymentService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    eventEmitter = module.get(EventEmitter2) as jest.Mocked<EventEmitter2>;

    jest.clearAllMocks();
    mockTx.$queryRawUnsafe.mockReset();
    mockTx.$executeRawUnsafe.mockReset();
    (tenantPrisma.run as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
    );
  });

  describe('recordPayment()', () => {
    it('sets invoice status to PAID when payment covers full balance', async () => {
      // Invoice total = 1000, paying 1000 → PAID
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([baseInvoiceRow])          // invoice lookup in tx
        .mockResolvedValueOnce([{ value: BigInt(1) }])    // sequence
        .mockResolvedValueOnce([basePaymentRow]);          // payment insert RETURNING

      // paid_amount query: SUM of non-deleted payments = 1000
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ total_paid: '1000.00' }]);

      mockTx.$executeRawUnsafe.mockResolvedValue(1);       // invoice status update

      await service.recordPayment(
        { invoiceId: 'inv-1', amount: 1000, method: PaymentMethod.CASH },
        'user-1',
      );

      expect(tenantPrisma.run).toHaveBeenCalledTimes(1);
      const updateCall = (mockTx.$executeRawUnsafe as jest.Mock).mock.calls.find(
        ([sql]: [string]) => sql?.includes('UPDATE invoices'),
      );
      expect(updateCall).toBeDefined();
      const [, status] = updateCall;
      expect(status).toBe('PAID');
    });

    it('sets invoice status to PARTIAL when payment is less than balance', async () => {
      // Invoice total = 1000, paying 500 → PARTIAL
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([baseInvoiceRow])
        .mockResolvedValueOnce([{ value: BigInt(2) }])
        .mockResolvedValueOnce([{ ...basePaymentRow, amount: '500.00' }]);

      // paid_amount query: SUM = 500
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ total_paid: '500.00' }]);

      mockTx.$executeRawUnsafe.mockResolvedValue(1);

      await service.recordPayment(
        { invoiceId: 'inv-1', amount: 500, method: PaymentMethod.CASH },
        'user-1',
      );

      const updateCall = (mockTx.$executeRawUnsafe as jest.Mock).mock.calls.find(
        ([sql]: [string]) => sql?.includes('UPDATE invoices'),
      );
      const [, status] = updateCall;
      expect(status).toBe('PARTIAL');
    });

    it('wraps payment insert and invoice update in a single transaction', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([baseInvoiceRow])
        .mockResolvedValueOnce([{ value: BigInt(3) }])
        .mockResolvedValueOnce([basePaymentRow])
        .mockResolvedValueOnce([{ total_paid: '1000.00' }]);
      mockTx.$executeRawUnsafe.mockResolvedValue(1);

      await service.recordPayment(
        { invoiceId: 'inv-1', amount: 1000, method: PaymentMethod.CASH },
        'user-1',
      );

      // The entire operation happens inside tenantPrisma.run (single tx)
      expect(tenantPrisma.run).toHaveBeenCalledTimes(1);
    });

    it('emits payment.received event after successful payment', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([baseInvoiceRow])
        .mockResolvedValueOnce([{ value: BigInt(4) }])
        .mockResolvedValueOnce([basePaymentRow])
        .mockResolvedValueOnce([{ total_paid: '1000.00' }]);
      mockTx.$executeRawUnsafe.mockResolvedValue(1);

      await service.recordPayment(
        { invoiceId: 'inv-1', amount: 1000, method: PaymentMethod.CASH },
        'user-1',
      );

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'payment.received',
        expect.objectContaining({
          studentId: 'student-1',
          invoiceId: 'inv-1',
          amount: 1000,
        }),
      );
    });
  });

  describe('cancelPayment()', () => {
    it('soft-deletes payment and recalculates invoice status', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([basePaymentRow]);

      // Combined query returns sum + invoice info in one row
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{
        total_paid: '0.00',
        total_amount: '1000.00',
        due_date: new Date('2025-07-15'),
      }]);
      mockTx.$executeRawUnsafe
        .mockResolvedValueOnce(1)  // soft-delete payment
        .mockResolvedValue(1);     // update invoice status

      await service.cancelPayment('pay-1');

      expect(tenantPrisma.run).toHaveBeenCalledTimes(1);
      const deleteCall = (mockTx.$executeRawUnsafe as jest.Mock).mock.calls.find(
        ([sql]: [string]) => sql?.includes('deleted_at'),
      );
      expect(deleteCall).toBeDefined();
    });
  });

  // QA-1 OBS-F: OVERDUE vs UNPAID must use Nepal's calendar today, not UTC/
  // server-local. At 2026-07-14 00:30 +05:45 (= 2026-07-13 18:45Z) an invoice
  // due 2026-07-13 is already OVERDUE in Nepal (the old UTC path saw "today"
  // as 2026-07-13 and returned UNPAID).
  describe('deriveStatus (OBS-F)', () => {
    afterEach(() => jest.restoreAllMocks());
    const derive = (due: string, paid = 0, total = 1000) =>
      (service as unknown as { deriveStatus: (t: number, p: number, d: string) => string })
        .deriveStatus(total, paid, due);

    it('is OVERDUE for a due-yesterday-Nepal invoice at the midnight boundary', () => {
      jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 6, 13, 18, 45, 0));
      expect(derive('2026-07-13')).toBe('OVERDUE'); // Nepal is 2026-07-14
    });

    it('is UNPAID when due today (Nepal) and nothing paid', () => {
      jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 6, 13, 18, 45, 0));
      expect(derive('2026-07-14')).toBe('UNPAID'); // due == Nepal-today
    });

    it('is PAID/PARTIAL regardless of date', () => {
      expect(derive('2020-01-01', 1000, 1000)).toBe('PAID');
      expect(derive('2020-01-01', 500, 1000)).toBe('PARTIAL');
    });
  });
});
