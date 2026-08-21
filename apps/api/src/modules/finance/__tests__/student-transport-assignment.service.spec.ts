import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StudentTransportAssignmentService } from '../student-transport-assignment.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

/**
 * FEE-CLASS-GUARD-2: the write paths now run a guard SELECT *before* the write
 * (soft-delete-guard.util.assertUsable). Queue its "row is live" answer first,
 * so the existing queues still line up with the real call order.
 */
const guardPasses = (q: jest.Mock) => q.mockResolvedValueOnce([{ id: 'live' }]);

const mockRow = {
  id: 'sta-1',
  student_id: 'student-1',
  transport_route_id: 'route-1',
  effective_from: new Date('2026-04-14'),
  effective_to: null,
  assigned_by: 'user-1',
  created_at: new Date('2026-04-14'),
  updated_at: new Date('2026-04-14'),
  deleted_at: null,
};

describe('StudentTransportAssignmentService', () => {
  let service: StudentTransportAssignmentService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        StudentTransportAssignmentService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
      ],
    }).compile();

    service = module.get(StudentTransportAssignmentService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    jest.clearAllMocks();
  });

  it('create() inserts and maps the response', async () => {
    guardPasses(tenantPrisma.query as jest.Mock);
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockRow]);
    const result = await service.create(
      { studentId: 'student-1', transportRouteId: 'route-1', effectiveFrom: '2026-04-14' },
      'user-1',
    );
    expect(result.transportRouteId).toBe('route-1');
  });

  it('findAll() paginates', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockRow, total_count: '1' }]);
    const result = await service.findAll({ page: 1, limit: 20 });
    expect(result.meta.total).toBe(1);
  });

  it('update() 404s on a missing row', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
    await expect(service.update('missing', { transportRouteId: 'route-2' })).rejects.toThrow(NotFoundException);
  });

  it('softDelete() 404s on a missing row', async () => {
    (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(0);
    await expect(service.softDelete('missing')).rejects.toThrow(NotFoundException);
  });

  it('findActiveForStudent() returns null when no assignment covers asOfDate', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
    const result = await service.findActiveForStudent('student-1', '2026-04-20');
    expect(result).toBeNull();
  });

  // FEE-CLASS-GUARD-2 path 2 — the guard is wired, and it does not over-reach.
  describe('retired transport route (FEE-CLASS-GUARD-2)', () => {
    it('FIRES: a retired route is refused and nothing is inserted', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]); // guard: no live row

      await expect(
        service.create(
          { studentId: 'student-1', transportRouteId: 'retired-route', effectiveFrom: '2026-04-14' },
          'user-1',
        ),
      ).rejects.toMatchObject({ response: { code: 'TRANSPORT_ROUTE_UNAVAILABLE' } });

      // The guard runs BEFORE the write: exactly one query, and no INSERT.
      expect(tenantPrisma.query).toHaveBeenCalledTimes(1);
      expect((tenantPrisma.query as jest.Mock).mock.calls[0][0]).not.toContain('INSERT');
    });

    it('PASSES: a live route still assigns normally', async () => {
      guardPasses(tenantPrisma.query as jest.Mock);
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockRow]);

      const result = await service.create(
        { studentId: 'student-1', transportRouteId: 'route-1', effectiveFrom: '2026-04-14' },
        'user-1',
      );

      expect(result.transportRouteId).toBe('route-1');
      expect((tenantPrisma.query as jest.Mock).mock.calls[1][0]).toContain('INSERT');
    });
  });
});
