import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FeeStructureService } from '../fee-structure.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';

const mockTx = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

const mockStructureRow = {
  id: 'fs-1',
  class_id: 'class-1',
  academic_year_id: 'year-1',
  created_by: 'user-1',
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  deleted_at: null,
};

const mockItemRow = {
  id: 'fsi-1',
  fee_structure_id: 'fs-1',
  fee_category_id: 'cat-1',
  fee_category_name: 'Tuition Fee',
  amount: '2000.00',
  due_day_of_month: 7,
  due_date: null,
  fine_per_day: '5.00',
  grace_period_days: 3,
  created_at: new Date('2024-01-01'),
};

describe('FeeStructureService', () => {
  let service: FeeStructureService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        FeeStructureService,
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
      ],
    }).compile();

    service = module.get(FeeStructureService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;

    jest.clearAllMocks();
    mockTx.$queryRawUnsafe.mockReset();
    mockTx.$executeRawUnsafe.mockReset();
    (tenantPrisma.run as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
    );
  });

  describe('createFeeStructure()', () => {
    it('creates structure with items in a single transaction', async () => {
      // No existing structure
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([]);           // conflict check
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([mockStructureRow]); // insert structure
      mockTx.$executeRawUnsafe.mockResolvedValue(1);             // insert item

      const result = await service.createFeeStructure(
        {
          classId: 'class-1',
          academicYearId: 'year-1',
          items: [{ feeCategoryId: 'cat-1', amount: 2000, finePerDay: 5, gracePeriodDays: 3 }],
        },
        'user-1',
      );

      expect(result.id).toBe('fs-1');
      expect(result.classId).toBe('class-1');
      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO fee_structure_items'),
        expect.any(String), // fee_structure_id
        'cat-1',            // fee_category_id
        2000,               // amount
        null,               // due_day_of_month (undefined → null in impl)
        null,               // due_date (undefined → null in impl)
        5,                  // fine_per_day
        3,                  // grace_period_days
      );
    });

    // POL-1 T1 regression: due_date is a DATE column; Prisma raw params ship JS strings
    // as text, so the INSERT must cast $5::date or Postgres rejects with 42804.
    it('accepts a dueDate string (casts due_date param to ::date)', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([]);
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([mockStructureRow]);
      mockTx.$executeRawUnsafe.mockResolvedValue(1);

      await service.createFeeStructure(
        {
          classId: 'class-1',
          academicYearId: 'year-1',
          items: [{ feeCategoryId: 'cat-1', amount: 2000, dueDate: '2026-08-15' }],
        },
        'user-1',
      );

      const [sql, ...params] = mockTx.$executeRawUnsafe.mock.calls[0] as [string, ...unknown[]];
      expect(sql).toContain('$5::date');
      expect(params[4]).toBe('2026-08-15');
    });

    it('throws ConflictException if structure already exists for class+year', async () => {
      // Existing structure found
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([mockStructureRow]);

      await expect(
        service.createFeeStructure(
          {
            classId: 'class-1',
            academicYearId: 'year-1',
            items: [{ feeCategoryId: 'cat-1', amount: 2000 }],
          },
          'user-1',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateItems()', () => {
    it('accepts a dueDate string on replace (casts due_date param to ::date)', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([mockStructureRow])   // updateItems existence check
        .mockResolvedValueOnce([mockStructureRow])   // findOne structure
        .mockResolvedValueOnce([mockItemRow]);       // findOne items
      mockTx.$executeRawUnsafe.mockResolvedValue(1);

      await service.updateItems('fs-1', {
        items: [{ feeCategoryId: 'cat-1', amount: 2500, dueDate: '2026-09-01' }],
      });

      const insertCall = mockTx.$executeRawUnsafe.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO fee_structure_items'),
      ) as [string, ...unknown[]];
      expect(insertCall[0]).toContain('$5::date');
      expect(insertCall[5]).toBe('2026-09-01');
    });
  });

  describe('findOne()', () => {
    it('returns structure with nested items', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([mockStructureRow])
        .mockResolvedValueOnce([mockItemRow]);

      const result = await service.findOne('fs-1');

      expect(result.id).toBe('fs-1');
      expect(result.items).toHaveLength(1);
      expect(result.items![0].amount).toBe(2000);
      expect(result.items![0].finePerDay).toBe(5);
    });
  });
});
