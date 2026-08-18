import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BulkAssignJobService } from '../bulk-assign-job.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { BulkAssignScopeType } from '../dto/student-fee-structure-assignment.dto';

const mockJobRow = {
  id: 'job-1',
  fee_structure_id: 'bfs-1',
  academic_year_id: 'year-1',
  scope_type: 'CLASS',
  scope_class_id: 'class-1',
  scope_section_id: null,
  scope_student_ids: ['s1', 's2'],
  effective_from: new Date('2026-04-14'),
  status: 'PENDING',
  total: 2,
  processed: 0,
  failed_count: 0,
  failures: [],
  created_by: 'user-1',
  created_at: new Date('2026-04-14'),
  started_at: null,
  completed_at: null,
};

describe('BulkAssignJobService', () => {
  let service: BulkAssignJobService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BulkAssignJobService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
      ],
    }).compile();

    service = module.get(BulkAssignJobService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    jest.clearAllMocks();
  });

  it('create() 404s when the fee structure does not exist', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
    await expect(
      service.create('missing', { scopeType: BulkAssignScopeType.CLASS, classId: 'class-1', effectiveFrom: '2026-04-14' }, 'user-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('create() rejects CLASS scope without classId', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ id: 'bfs-1', academic_year_id: 'year-1' }]);
    await expect(
      service.create('bfs-1', { scopeType: BulkAssignScopeType.CLASS, effectiveFrom: '2026-04-14' }, 'user-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('create() rejects STUDENT_LIST scope without studentIds', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ id: 'bfs-1', academic_year_id: 'year-1' }]);
    await expect(
      service.create('bfs-1', { scopeType: BulkAssignScopeType.STUDENT_LIST, effectiveFrom: '2026-04-14' }, 'user-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('create() resolves a CLASS roster and freezes it onto the job row', async () => {
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ id: 'bfs-1', academic_year_id: 'year-1' }]) // structure lookup
      .mockResolvedValueOnce([{ id: 's1' }, { id: 's2' }]) // roster
      .mockResolvedValueOnce([mockJobRow]); // insert RETURNING

    const result = await service.create(
      'bfs-1',
      { scopeType: BulkAssignScopeType.CLASS, classId: 'class-1', effectiveFrom: '2026-04-14' },
      'user-1',
    );

    expect(result.total).toBe(2);
    expect(result.status).toBe('PENDING');
    expect(tenantPrisma.query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO bulk_assign_jobs'),
      'bfs-1',
      'year-1',
      'CLASS',
      'class-1',
      null,
      JSON.stringify(['s1', 's2']),
      '2026-04-14',
      2,
      'user-1',
      false, // FEE-CLASS-GUARD: allow_cross_class defaults off when the DTO omits it
    );
  });

  it('create() freezes an explicit allowCrossClassAssignment onto the job row', async () => {
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ id: 'bfs-1', academic_year_id: 'year-1' }])
      .mockResolvedValueOnce([{ ...mockJobRow, allow_cross_class: true }]);

    const result = await service.create(
      'bfs-1',
      {
        scopeType: BulkAssignScopeType.STUDENT_LIST,
        studentIds: ['s1'],
        effectiveFrom: '2026-04-14',
        allowCrossClassAssignment: true,
      },
      'user-1',
    );

    expect(result.allowCrossClassAssignment).toBe(true);
    expect(tenantPrisma.query).toHaveBeenLastCalledWith(
      expect.stringContaining('allow_cross_class'),
      'bfs-1', 'year-1', 'STUDENT_LIST', null, null,
      JSON.stringify(['s1']), '2026-04-14', 1, 'user-1', true,
    );
  });

  it('create() with STUDENT_LIST scope uses the given ids directly (no roster query)', async () => {
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ id: 'bfs-1', academic_year_id: 'year-1' }])
      .mockResolvedValueOnce([mockJobRow]);

    await service.create(
      'bfs-1',
      { scopeType: BulkAssignScopeType.STUDENT_LIST, studentIds: ['s1', 's2'], effectiveFrom: '2026-04-14' },
      'user-1',
    );

    expect(tenantPrisma.query).toHaveBeenCalledTimes(2); // structure lookup + insert, no roster SELECT
  });

  it('findOne() 404s on a missing job', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('findOne() returns the job with progress fields', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
      { ...mockJobRow, status: 'COMPLETED', processed: 2, completed_at: new Date('2026-04-14T01:00:00Z') },
    ]);
    const result = await service.findOne('job-1');
    expect(result.status).toBe('COMPLETED');
    expect(result.processed).toBe(2);
  });
});
