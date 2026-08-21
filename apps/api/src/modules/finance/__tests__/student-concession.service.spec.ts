import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StudentConcessionService } from '../student-concession.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

/**
 * FEE-CLASS-GUARD-2: the write paths now run a guard SELECT *before* the write
 * (soft-delete-guard.util.assertUsable). Queue its "row is live" answer first,
 * so the existing queues still line up with the real call order.
 */
const guardPasses = (q: jest.Mock) => q.mockResolvedValueOnce([{ id: 'live' }]);

const mockRow = {
  id: 'sc-1',
  student_id: 'student-1',
  fee_head_id: null,
  fee_head_name: undefined,
  academic_year_id: 'year-1',
  type: 'PERCENT',
  value: '20.00',
  cap_amount: '500.00',
  discount_reason_id: 'reason-1',
  discount_reason_name: 'Scholarship',
  effective_from: new Date('2026-04-14'),
  effective_to: null,
  notes: null,
  created_by: 'user-1',
  created_at: new Date('2026-04-14'),
  updated_at: new Date('2026-04-14'),
  deleted_at: null,
};

describe('StudentConcessionService', () => {
  let service: StudentConcessionService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        StudentConcessionService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
      ],
    }).compile();

    service = module.get(StudentConcessionService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    jest.clearAllMocks();
  });

  it('create() with no feeHeadId inserts a NULL fee_head_id (whole-bill concession)', async () => {
    guardPasses(tenantPrisma.query as jest.Mock);
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockRow]);
    const result = await service.create(
      {
        studentId: 'student-1',
        academicYearId: 'year-1',
        type: 'PERCENT' as never,
        value: '20.00',
        capAmount: '500.00',
        discountReasonId: 'reason-1',
        effectiveFrom: '2026-04-14',
      },
      'user-1',
    );
    expect(result.feeHeadId).toBeNull();
    expect(tenantPrisma.query).toHaveBeenCalledWith(
      expect.stringContaining('$6::numeric'),
      'student-1',
      null, // fee_head_id
      'year-1',
      'PERCENT',
      '20.00',
      '500.00',
      'reason-1',
      '2026-04-14',
      null,
      null,
      'user-1',
    );
  });

  it('create() with a feeHeadId inserts a head-scoped concession', async () => {
    guardPasses(tenantPrisma.query as jest.Mock);
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockRow, fee_head_id: 'head-1' }]);
    const result = await service.create(
      {
        studentId: 'student-1',
        feeHeadId: 'head-1',
        academicYearId: 'year-1',
        type: 'AMOUNT' as never,
        value: '300.00',
        discountReasonId: 'reason-1',
        effectiveFrom: '2026-04-14',
      },
      'user-1',
    );
    expect(result.feeHeadId).toBe('head-1');
  });

  it('findAll() paginates and reports total from the window count', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockRow, total_count: '1' }]);
    const result = await service.findAll({ page: 1, limit: 20 });
    expect(result.meta.total).toBe(1);
  });

  it('update() 404s on a missing row', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
    await expect(service.update('missing', { value: '10' })).rejects.toThrow(NotFoundException);
  });

  it('softDelete() 404s on a missing row', async () => {
    (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(0);
    await expect(service.softDelete('missing')).rejects.toThrow(NotFoundException);
  });

  it('findActiveForStudent() filters by the effective range around asOfDate', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockRow]);
    await service.findActiveForStudent('student-1', 'year-1', '2026-04-20');
    expect(tenantPrisma.query).toHaveBeenCalledWith(
      expect.stringContaining('effective_from <= $3::date'),
      'student-1',
      'year-1',
      '2026-04-20',
    );
  });

  // FEE-CLASS-GUARD-2 path 3, ruling 3 — BOTH doors. A guard one PATCH away
  // from bypass reads as protection in review and provides none.
  describe('retired discount reason (FEE-CLASS-GUARD-2)', () => {
    it('FIRES on create(): refused, nothing inserted', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      await expect(
        service.create(
          {
            studentId: 'student-1', academicYearId: 'year-1', type: 'PERCENT', value: '10',
            discountReasonId: 'retired-reason', effectiveFrom: '2026-04-14',
          } as never,
          'user-1',
        ),
      ).rejects.toMatchObject({ response: { code: 'DISCOUNT_REASON_UNAVAILABLE' } });

      expect(tenantPrisma.query).toHaveBeenCalledTimes(1);
      expect((tenantPrisma.query as jest.Mock).mock.calls[0][0]).not.toContain('INSERT');
    });

    it('FIRES on update() too — the door that would otherwise be a bypass', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      await expect(
        service.update('conc-1', { discountReasonId: 'retired-reason' } as never),
      ).rejects.toMatchObject({ response: { code: 'DISCOUNT_REASON_UNAVAILABLE' } });

      expect(tenantPrisma.query).toHaveBeenCalledTimes(1);
      expect((tenantPrisma.query as jest.Mock).mock.calls[0][0]).not.toContain('UPDATE');
    });

    it('PASSES: an update that does NOT touch the reason is not guarded at all', async () => {
      // Over-reach check. The guard must only run when the caller actually
      // supplies a reason — otherwise every unrelated edit pays for a lookup
      // and, worse, could fail on a reason retired long after the fact.
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockRow]);

      await service.update('conc-1', { value: '15' } as never);

      expect(tenantPrisma.query).toHaveBeenCalledTimes(1);
      expect((tenantPrisma.query as jest.Mock).mock.calls[0][0]).toContain('UPDATE');
    });
  });
});
