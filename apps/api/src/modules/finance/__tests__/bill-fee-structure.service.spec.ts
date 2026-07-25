import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BillFeeStructureService } from '../bill-fee-structure.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockTx = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

const mockStructureRow = {
  id: 'bfs-1',
  academic_year_id: 'year-1',
  class_id: 'class-1',
  section_id: null,
  name: 'Grade 5 — Day scholar',
  is_active: true,
  created_by: 'user-1',
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
  deleted_at: null,
};

describe('BillFeeStructureService', () => {
  let service: BillFeeStructureService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BillFeeStructureService,
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

    service = module.get(BillFeeStructureService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    jest.clearAllMocks();
    mockTx.$queryRawUnsafe.mockReset();
    mockTx.$executeRawUnsafe.mockReset();
    (tenantPrisma.run as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
    );
  });

  describe('createFeeStructure()', () => {
    it('creates a structure with items when no name collision exists', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([]) // no existing name collision
        .mockResolvedValueOnce([mockStructureRow]); // INSERT RETURNING
      mockTx.$executeRawUnsafe.mockResolvedValue(1);

      const result = await service.createFeeStructure(
        {
          academicYearId: 'year-1',
          classId: 'class-1',
          name: 'Grade 5 — Day scholar',
          items: [{ feeHeadId: 'fh-1', amount: '2000.00', effectiveFrom: '2026-01-01' }],
        },
        'user-1',
      );

      expect(result.id).toBe('bfs-1');
      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bill_fee_structure_items'),
        'bfs-1',
        'fh-1',
        '2000.00',
        null,
        '2026-01-01',
        null,
      );
    });

    it('SPEC: two structures for the same class+year with DIFFERENT names both persist', async () => {
      // First structure: "Day scholar"
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([]) // no collision for "Day scholar"
        .mockResolvedValueOnce([mockStructureRow]);
      mockTx.$executeRawUnsafe.mockResolvedValue(1);

      const first = await service.createFeeStructure(
        { academicYearId: 'year-1', classId: 'class-1', name: 'Grade 5 — Day scholar', items: [] },
        'user-1',
      );

      // Second structure: same year+class, different name "Hosteller" —
      // the exact case the old fee_structures UNIQUE(class_id, academic_year_id)
      // made impossible.
      jest.clearAllMocks();
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([]) // no collision for "Hosteller" (different name)
        .mockResolvedValueOnce([{ ...mockStructureRow, id: 'bfs-2', name: 'Grade 5 — Hosteller' }]);
      mockTx.$executeRawUnsafe.mockResolvedValue(1);

      const second = await service.createFeeStructure(
        { academicYearId: 'year-1', classId: 'class-1', name: 'Grade 5 — Hosteller', items: [] },
        'user-1',
      );

      expect(first.id).toBe('bfs-1');
      expect(second.id).toBe('bfs-2');
      expect(first.name).not.toBe(second.name);
    });

    it('rejects an EXACT name collision in the same class/section/year scope', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'bfs-1' }]); // collision found

      await expect(
        service.createFeeStructure(
          { academicYearId: 'year-1', classId: 'class-1', name: 'Grade 5 — Day scholar', items: [] },
          'user-1',
        ),
      ).rejects.toThrow(ConflictException);
      expect(mockTx.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('collision check is NULL-safe on section_id (IS NOT DISTINCT FROM)', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([mockStructureRow]);
      mockTx.$executeRawUnsafe.mockResolvedValue(1);

      await service.createFeeStructure(
        { academicYearId: 'year-1', classId: 'class-1', name: 'Grade 5 — Day scholar', items: [] },
        'user-1',
      );

      const [sql, , , sectionParam] = mockTx.$queryRawUnsafe.mock.calls[0];
      expect(sql).toContain('IS NOT DISTINCT FROM');
      expect(sectionParam).toBeNull();
    });
  });

  describe('findOne()', () => {
    it('returns the structure with its items and fee head names', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([mockStructureRow])
        .mockResolvedValueOnce([{
          id: 'item-1',
          fee_structure_id: 'bfs-1',
          fee_head_id: 'fh-1',
          fee_head_name: 'Tuition Fee',
          amount: '2000.00',
          recurrence_override: null,
          effective_from: new Date('2026-01-01'),
          effective_to: null,
          created_at: new Date('2026-01-01'),
        }]);

      const result = await service.findOne('bfs-1');
      expect(result.items).toHaveLength(1);
      expect(result.items![0].feeHeadName).toBe('Tuition Fee');
      expect(result.items![0].amount).toBe(2000);
    });

    it('404s when the structure does not exist', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateItems()', () => {
    it('replaces all items in a transaction', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([mockStructureRow]) // existence check
        .mockResolvedValueOnce([mockStructureRow]) // findOne structure
        .mockResolvedValueOnce([]); // findOne items
      mockTx.$executeRawUnsafe.mockResolvedValue(1);

      await service.updateItems('bfs-1', {
        items: [{ feeHeadId: 'fh-2', amount: '2500.00', effectiveFrom: '2026-02-01' }],
      });

      const deleteCall = mockTx.$executeRawUnsafe.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('DELETE FROM bill_fee_structure_items'),
      );
      expect(deleteCall).toBeDefined();
    });

    it('404s when the structure does not exist', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(
        service.updateItems('missing', { items: [] }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('softDelete()', () => {
    it('404s on a missing row', async () => {
      (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(0);
      await expect(service.softDelete('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
