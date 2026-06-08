import { Test } from '@nestjs/testing';
import { AcademicMigrationService } from '../academic-migration.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

describe('AcademicMigrationService', () => {
  let service: AcademicMigrationService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  const mockTx = {
    $queryRawUnsafe: jest.fn(),
    $executeRawUnsafe: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AcademicMigrationService,
        {
          provide: TenantPrismaService,
          useValue: {
            run: jest.fn().mockImplementation((fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
            query: jest.fn(),
            execute: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(AcademicMigrationService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;

    jest.clearAllMocks();
    mockTx.$queryRawUnsafe.mockReset();
    mockTx.$executeRawUnsafe.mockReset();
    (tenantPrisma.run as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
    );
  });

  describe('migrateStudentClassReferences()', () => {
    it('creates class and section from text columns and updates student', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { id: 'student-1', class_name: 'Grade 10', section_name: 'A' },
      ]);

      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([])                           // class lookup: not found
        .mockResolvedValueOnce([{ id: 'class-1' }])         // class insert
        .mockResolvedValueOnce([])                           // section lookup: not found
        .mockResolvedValueOnce([{ id: 'section-1' }]);       // section insert
      mockTx.$executeRawUnsafe.mockResolvedValueOnce(1);     // student update

      const result = await service.migrateStudentClassReferences();

      expect(result.migrated).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('SET class_id'),
        'class-1',
        'section-1',
        'student-1',
      );
    });

    it('is idempotent — reuses existing class/section on second run', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { id: 'student-2', class_name: 'Grade 10', section_name: 'A' },
      ]);

      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ id: 'class-1' }])    // class found
        .mockResolvedValueOnce([{ id: 'section-1' }]); // section found
      mockTx.$executeRawUnsafe.mockResolvedValueOnce(1);

      const result = await service.migrateStudentClassReferences();

      expect(result.migrated).toBe(1);
      // Only 2 query calls (lookup class, lookup section) — no insert calls
      expect(mockTx.$queryRawUnsafe).toHaveBeenCalledTimes(2);
    });

    it('returns migrated=0 when all students already have class_id set', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      const result = await service.migrateStudentClassReferences();

      expect(result.migrated).toBe(0);
      expect(result.failed).toBe(0);
    });
  });
});
