import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StudentTransportAssignmentService } from '../student-transport-assignment.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

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
});
