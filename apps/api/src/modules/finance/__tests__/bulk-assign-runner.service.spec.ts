import { Test } from '@nestjs/testing';
import { BulkAssignRunnerService } from '../bulk-assign-runner.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { BulkAssignJobRow } from '../entities/bill-assignment.entity';

const mockTx = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

function makeJob(overrides: Partial<BulkAssignJobRow> = {}): BulkAssignJobRow {
  return {
    id: 'job-1',
    fee_structure_id: 'bfs-1',
    academic_year_id: 'year-1',
    scope_type: 'CLASS',
    scope_class_id: 'class-1',
    scope_section_id: null,
    scope_student_ids: ['s1', 's2'],
    effective_from: '2026-04-14',
    status: 'PENDING',
    total: 2,
    processed: 0,
    failed_count: 0,
    failures: [],
    created_by: 'user-1',
    created_at: new Date('2026-04-14'),
    started_at: null,
    completed_at: null,
    ...overrides,
  };
}

describe('BulkAssignRunnerService', () => {
  let service: BulkAssignRunnerService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BulkAssignRunnerService,
        {
          provide: TenantPrismaService,
          useValue: {
            query: jest.fn(),
            execute: jest.fn(),
            run: jest.fn().mockImplementation((fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
          },
        },
      ],
    }).compile();

    service = module.get(BulkAssignRunnerService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    jest.clearAllMocks();
  });

  it('drainCurrentTenant() is a no-op when there are no pending/running jobs', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
    const result = await service.drainCurrentTenant();
    expect(result).toEqual({ jobsDrained: 0, studentsProcessed: 0 });
    expect(tenantPrisma.run).not.toHaveBeenCalled();
  });

  it('processes a small job (under the chunk size) in a single chunk transaction', async () => {
    const job = makeJob();
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([job]);
    mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 's1' }, { id: 's2' }]); // both valid

    const result = await service.drainCurrentTenant();

    expect(result).toEqual({ jobsDrained: 1, studentsProcessed: 2 });
    expect(tenantPrisma.run).toHaveBeenCalledTimes(1);
    // status -> RUNNING, then -> COMPLETED
    expect(tenantPrisma.execute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'RUNNING'"),
      'job-1',
    );
    expect(tenantPrisma.execute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'COMPLETED'"),
      'job-1',
    );
    // the batched insert used unnest(), not a per-student loop of individual INSERTs
    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('unnest($1::uuid[])'),
      ['s1', 's2'],
      'bfs-1',
      'year-1',
      '2026-04-14',
      'user-1',
    );
  });

  it('splits a roster larger than the chunk size (200) into multiple chunk transactions', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `s${i}`);
    const job = makeJob({ scope_student_ids: ids, total: 250 });
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([job]);
    // Each chunk's validation SELECT: return every id in that chunk as valid.
    mockTx.$queryRawUnsafe.mockImplementation((_sql: string, chunkIds: string[]) =>
      Promise.resolve(chunkIds.map((id) => ({ id }))),
    );

    const result = await service.drainCurrentTenant();

    expect(result.studentsProcessed).toBe(250);
    expect(tenantPrisma.run).toHaveBeenCalledTimes(2); // 200 + 50
  });

  it('records an invalid/inactive student id as a per-student failure, not a chunk-wide abort', async () => {
    const job = makeJob({ scope_student_ids: ['s1', 'ghost'] });
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([job]);
    mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 's1' }]); // 'ghost' not returned -> invalid

    await service.drainCurrentTenant();

    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE bulk_assign_jobs'),
      'job-1',
      2, // chunk.length
      1, // newFailures.length
      JSON.stringify([{ studentId: 'ghost', error: 'Student not found or inactive' }]),
    );
    // the valid student still gets processed via the batched insert
    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('unnest($1::uuid[])'),
      ['s1'],
      'bfs-1',
      'year-1',
      '2026-04-14',
      'user-1',
    );
  });

  it('a job whose processing throws is marked FAILED and does not abort the tenant drain', async () => {
    const job = makeJob();
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([job]);
    (tenantPrisma.run as jest.Mock).mockRejectedValueOnce(new Error('db exploded'));

    const result = await service.drainCurrentTenant();

    expect(result.jobsDrained).toBe(0);
    expect(tenantPrisma.execute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'FAILED'"),
      'job-1',
    );
  });

  it('resumes a RUNNING job from its existing processed count, not from zero', async () => {
    const job = makeJob({ status: 'RUNNING', processed: 1, scope_student_ids: ['s1', 's2'] });
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([job]);
    mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 's2' }]);

    await service.drainCurrentTenant();

    // Only the un-processed tail (['s2']) is validated/inserted — s1 is not re-attempted.
    expect(mockTx.$queryRawUnsafe).toHaveBeenCalledWith(expect.any(String), ['s2']);
    // Already-RUNNING jobs don't get a redundant PENDING->RUNNING transition.
    // (Matching on "SET status = 'RUNNING'" specifically — the completion
    // query's own WHERE clause also contains "status = 'RUNNING'", so a
    // looser match would false-positive against that unrelated call.)
    expect(tenantPrisma.execute).not.toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'RUNNING'"),
      'job-1',
    );
  });
});
