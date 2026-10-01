import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BillFeeStructureService } from '../bill-fee-structure.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { guardSurvivingMocks } from '../../../testing/mock-leak-guard';

const mockTx = guardSurvivingMocks({
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
});

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
        '2026-01-01',
        null,
      );
      const insertSql = mockTx.$executeRawUnsafe.mock.calls.find(([q]) => String(q).includes('INSERT INTO bill_fee_structure_items'))![0] as string;
      expect(insertSql).not.toContain('recurrence_override');
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

    it('a SOFT-DELETED structure with the same name still collides: 409 CONFLICT_DUPLICATE, never a 500 (23505 from the unique constraint)', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'bfs-old', deleted_at: new Date('2026-09-29') }]);

      const err = await service
        .createFeeStructure(
          { academicYearId: 'year-1', classId: 'class-9', name: 'Grade 9 Fees 2083', items: [] },
          'user-1',
        )
        .catch((e) => e);

      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({
        code: 'CONFLICT_DUPLICATE',
        message: expect.stringContaining('was deleted earlier'),
        details: { name: 'Grade 9 Fees 2083', retired: true },
      });
      expect(mockTx.$executeRawUnsafe).not.toHaveBeenCalled();
      // the INSERT must never be reached
      expect(mockTx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    });

    it('the collision lookup does not filter out deleted rows (the DB constraint does not)', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([mockStructureRow]);
      mockTx.$executeRawUnsafe.mockResolvedValue(1);
      await service.createFeeStructure(
        { academicYearId: 'year-1', classId: 'class-1', name: 'Grade 5 — Day scholar', items: [] },
        'user-1',
      );
      expect(String(mockTx.$queryRawUnsafe.mock.calls[0][0])).not.toMatch(/deleted_at IS NULL/);
    });

    it('a LIVE collision reports code CONFLICT_DUPLICATE with retired=false', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'bfs-1', deleted_at: null }]);
      const err = await service
        .createFeeStructure({ academicYearId: 'year-1', classId: 'class-1', name: 'X', items: [] }, 'user-1')
        .catch((e) => e);
      expect(err.getResponse()).toMatchObject({ code: 'CONFLICT_DUPLICATE', details: { name: 'X', retired: false } });
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

  describe('findAll()', () => {
    const itemRow = (id: string, structureId: string, head: string) => ({
      id, fee_structure_id: structureId, fee_head_id: `fh-${id}`, fee_head_name: head, amount: '1000.00',
      effective_from: new Date('2026-07-17'), effective_to: null, created_at: new Date('2026-09-29'),
    });

    it('carries each structures items (the list column + Edit Items pre-fill read them off the list row)', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([
          { ...mockStructureRow, id: 'bfs-1', total_count: '2' },
          { ...mockStructureRow, id: 'bfs-2', total_count: '2' },
        ])
        .mockResolvedValueOnce([itemRow('i1', 'bfs-1', 'Admission'), itemRow('i2', 'bfs-1', 'Tuition'), itemRow('i3', 'bfs-2', 'Admission')]);

      const { data } = await service.findAll({} as never);

      expect(data.find((d) => d.id === 'bfs-1')!.items!.map((i) => i.feeHeadName)).toEqual(['Admission', 'Tuition']);
      expect(data.find((d) => d.id === 'bfs-2')!.items).toHaveLength(1);
      // one batched items query, not one per structure
      expect((tenantPrisma.query as jest.Mock)).toHaveBeenCalledTimes(2);
      expect((tenantPrisma.query as jest.Mock).mock.calls[1][1]).toEqual(['bfs-1', 'bfs-2']);
    });

    it('a structure with no items gets [] (0), not undefined (which the UI renders as a dash)', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ ...mockStructureRow, id: 'bfs-1', total_count: '1' }])
        .mockResolvedValueOnce([]);
      const { data } = await service.findAll({} as never);
      expect(data[0].items).toEqual([]);
    });

    it('an empty page skips the items query entirely', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      const { data } = await service.findAll({} as never);
      expect(data).toEqual([]);
      expect((tenantPrisma.query as jest.Mock)).toHaveBeenCalledTimes(1);
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
      // an edit re-inserts the item set without the removed recurrence_override column
      const insertCall = mockTx.$executeRawUnsafe.mock.calls.find(([q]) => String(q).includes('INSERT INTO bill_fee_structure_items'))!;
      expect(insertCall[0]).not.toContain('recurrence_override');
      expect(insertCall.slice(1)).toEqual(['bfs-1', 'fh-2', '2500.00', '2026-02-01', null]);
    });

    it('an EMPTY item list is refused with 422 and nothing is deleted (it would wipe every item)', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockStructureRow]); // existence check
      const err = await service.updateItems('bfs-1', { items: [] }).catch((e) => e);
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      expect(err.getResponse()).toMatchObject({ code: 'VALIDATION_FAILED', details: { field: 'items' } });
      expect(mockTx.$executeRawUnsafe).not.toHaveBeenCalled();
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
