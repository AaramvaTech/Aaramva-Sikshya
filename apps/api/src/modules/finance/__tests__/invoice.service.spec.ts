import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InvoiceService } from '../invoice.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';

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
  subtotal: '2000.00',
  discount_amount: '0.00',
  fine_amount: '0.00',
  total_amount: '2000.00',
  paid_amount: '0.00',
  balance: '2000.00',
  created_by: 'user-1',
  created_at: new Date('2025-07-01'),
  updated_at: new Date('2025-07-01'),
  deleted_at: null,
};

const baseFsiRow = {
  id: 'fsi-1',
  fee_structure_id: 'fs-1',
  fee_category_id: 'cat-1',
  fee_category_name: 'Tuition Fee',
  amount: '2000.00',
  due_day_of_month: 7,
  due_date: null,
  fine_per_day: '5.00',
  grace_period_days: 2,
  created_at: new Date('2025-07-01'),
};

function setupGenerateMocks(
  fsiRows: object[],
  assignmentRows: object[],
  seqValue: bigint = BigInt(1),
  invoiceRow: object = baseInvoiceRow,
) {
  return {
    queryMocks: [
      [{ id: 'student-1', class_id: 'class-1' }], // student lookup
      fsiRows,                                       // fee structure items
      assignmentRows,                                // assignments
    ],
    txMocks: [
      [{ value: seqValue }],  // sequence
      [invoiceRow],            // invoice INSERT RETURNING
    ],
  };
}

describe('InvoiceService', () => {
  let service: InvoiceService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        InvoiceService,
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

    service = module.get(InvoiceService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    eventEmitter = module.get(EventEmitter2) as jest.Mocked<EventEmitter2>;

    jest.clearAllMocks();
    mockTx.$queryRawUnsafe.mockReset();
    mockTx.$executeRawUnsafe.mockReset();
    (tenantPrisma.run as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
    );
  });

  describe('generateInvoice()', () => {
    it('calculates 20% discount correctly — Rs.2000 item → Rs.400 off, total Rs.1600', async () => {
      const { queryMocks, txMocks } = setupGenerateMocks(
        [baseFsiRow],
        [{ fee_structure_item_id: 'fsi-1', custom_amount: null, discount_percent: '20.00', is_waived: false }],
      );
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce(queryMocks[0])
        .mockResolvedValueOnce(queryMocks[1])
        .mockResolvedValueOnce(queryMocks[2]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce(txMocks[0])
        .mockResolvedValueOnce(txMocks[1]);
      mockTx.$executeRawUnsafe.mockResolvedValue(1);

      await service.generateInvoice(
        { studentId: 'student-1', academicYearId: 'year-1', dueDate: '2025-07-15' },
        'user-1',
      );

      // Find the invoice INSERT call and verify amounts
      const invoiceInsertCall = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls.find(
        ([sql]: [string]) => sql?.includes('INSERT INTO invoices'),
      );
      expect(invoiceInsertCall).toBeDefined();
      // params: invoiceNumber, studentId, academicYearId, dueDate, subtotal, discountAmount, totalAmount, createdBy
      const [, , , , , subtotal, discountAmount, totalAmount] = invoiceInsertCall;
      expect(subtotal).toBe(2000);
      expect(discountAmount).toBe(400);
      expect(totalAmount).toBe(1600);
    });

    it('applies is_waived correctly — waived item makes total Rs.0', async () => {
      const { queryMocks, txMocks } = setupGenerateMocks(
        [baseFsiRow],
        [{ fee_structure_item_id: 'fsi-1', custom_amount: null, discount_percent: '0.00', is_waived: true }],
      );
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce(queryMocks[0])
        .mockResolvedValueOnce(queryMocks[1])
        .mockResolvedValueOnce(queryMocks[2]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce(txMocks[0])
        .mockResolvedValueOnce(txMocks[1]);
      mockTx.$executeRawUnsafe.mockResolvedValue(1);

      await service.generateInvoice(
        { studentId: 'student-1', academicYearId: 'year-1', dueDate: '2025-07-15' },
        'user-1',
      );

      const invoiceInsertCall = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls.find(
        ([sql]: [string]) => sql?.includes('INSERT INTO invoices'),
      );
      const [, , , , , subtotal, discountAmount, totalAmount] = invoiceInsertCall;
      expect(subtotal).toBe(2000);
      expect(discountAmount).toBe(2000);
      expect(totalAmount).toBe(0);
    });

    it('uses custom_amount from assignment — Rs.1500 custom with 10% → Rs.1350 total', async () => {
      const { queryMocks, txMocks } = setupGenerateMocks(
        [baseFsiRow],
        [{ fee_structure_item_id: 'fsi-1', custom_amount: '1500.00', discount_percent: '10.00', is_waived: false }],
      );
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce(queryMocks[0])
        .mockResolvedValueOnce(queryMocks[1])
        .mockResolvedValueOnce(queryMocks[2]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce(txMocks[0])
        .mockResolvedValueOnce(txMocks[1]);
      mockTx.$executeRawUnsafe.mockResolvedValue(1);

      await service.generateInvoice(
        { studentId: 'student-1', academicYearId: 'year-1', dueDate: '2025-07-15' },
        'user-1',
      );

      const invoiceInsertCall = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls.find(
        ([sql]: [string]) => sql?.includes('INSERT INTO invoices'),
      );
      const [, , , , , subtotal, discountAmount, totalAmount] = invoiceInsertCall;
      expect(subtotal).toBe(1500);
      expect(discountAmount).toBe(150);
      expect(totalAmount).toBe(1350);
    });

    it('generates unique invoice number in INV-{YEAR}-{6-digit} format', async () => {
      const { queryMocks, txMocks } = setupGenerateMocks(
        [baseFsiRow],
        [],
        BigInt(42),
      );
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce(queryMocks[0])
        .mockResolvedValueOnce(queryMocks[1])
        .mockResolvedValueOnce(queryMocks[2]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce(txMocks[0])
        .mockResolvedValueOnce(txMocks[1]);
      mockTx.$executeRawUnsafe.mockResolvedValue(1);

      await service.generateInvoice(
        { studentId: 'student-1', academicYearId: 'year-1', dueDate: '2025-07-15' },
        'user-1',
      );

      const invoiceInsertCall = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls.find(
        ([sql]: [string]) => sql?.includes('INSERT INTO invoices'),
      );
      const [, invoiceNumber] = invoiceInsertCall;
      expect(invoiceNumber).toMatch(/^INV-\d{4}-000042$/);
    });
  });

  describe('generateBulkInvoice()', () => {
    it('skips students who already have an invoice for the same due date', async () => {
      // 3 students enrolled, student-3 already has an invoice
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([
          { id: 'student-1' },
          { id: 'student-2' },
          { id: 'student-3' },
        ])
        .mockResolvedValueOnce([])   // student-1: no existing invoice
        .mockResolvedValueOnce([])   // student-2: no existing invoice
        .mockResolvedValueOnce([{ id: 'inv-existing' }]); // student-3: already has one

      jest.spyOn(service, 'generateInvoice').mockResolvedValue({} as never);

      const result = await service.generateBulkInvoice(
        { classId: 'class-1', academicYearId: 'year-1', dueDate: '2025-07-15' },
        'user-1',
      );

      expect(result.generated).toBe(2);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('recalculateFine()', () => {
    it('sets fine_amount = days_overdue * fine_per_day (grace period applied)', async () => {
      // Invoice due 10 days ago, fine_per_day = 5, grace = 2 → days_overdue = 8 → fine = 40
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() - 10);

      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
        id: 'inv-1',
        due_date: dueDate,
        status: 'UNPAID',
        subtotal: '1000.00',
        discount_amount: '0.00',
        total_fine_per_day: '5.00',
        max_grace_period_days: 2,
      }]);
      (tenantPrisma.execute as jest.Mock).mockResolvedValue(1);

      await service.recalculateFine('inv-1');

      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE invoices'),
        40,                    // fine_amount = 8 * 5
        expect.any(Number),    // total_amount = 1000 - 0 + 40 = 1040
        expect.any(String),    // status
        'inv-1',
      );
    });
  });
});
