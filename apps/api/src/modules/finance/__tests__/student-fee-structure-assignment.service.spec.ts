import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StudentFeeStructureAssignmentService } from '../student-fee-structure-assignment.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockTx = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

const mockAssignmentRow = {
  id: 'sfsa-1',
  student_id: 'student-1',
  fee_structure_id: 'bfs-1',
  academic_year_id: 'year-1',
  effective_from: new Date('2026-04-14'),
  effective_to: null,
  assigned_by: 'user-1',
  created_at: new Date('2026-04-14'),
  updated_at: new Date('2026-04-14'),
  deleted_at: null,
};

describe('StudentFeeStructureAssignmentService', () => {
  let service: StudentFeeStructureAssignmentService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        StudentFeeStructureAssignmentService,
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

    service = module.get(StudentFeeStructureAssignmentService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    jest.clearAllMocks();
  });

  it('assign() 404s when the fee structure does not exist', async () => {
    mockTx.$queryRawUnsafe.mockResolvedValueOnce([]); // structure lookup -> not found
    await expect(
      service.assign('student-1', { feeStructureId: 'missing', effectiveFrom: '2026-04-14' }, 'user-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('assign() 404s when the student does not exist', async () => {
    mockTx.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'bfs-1', academic_year_id: 'year-1' }]) // structure found
      .mockResolvedValueOnce([]); // student not found
    await expect(
      service.assign('missing-student', { feeStructureId: 'bfs-1', effectiveFrom: '2026-04-14' }, 'user-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('assign() closes any existing OPEN assignment before inserting the new one', async () => {
    mockTx.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'bfs-1', academic_year_id: 'year-1' }]) // structure
      .mockResolvedValueOnce([{ id: 'student-1' }]) // student
      .mockResolvedValueOnce([mockAssignmentRow]); // insert RETURNING

    const result = await service.assign(
      'student-1',
      { feeStructureId: 'bfs-1', effectiveFrom: '2026-04-14' },
      'user-1',
    );

    expect(result.id).toBe('sfsa-1');
    // The UPDATE that closes the prior open row runs before the INSERT.
    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE student_fee_structure_assignments'),
      'student-1',
      'year-1',
      '2026-04-14',
    );
    expect(mockTx.$queryRawUnsafe).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO student_fee_structure_assignments'),
      'student-1',
      'bfs-1',
      'year-1',
      '2026-04-14',
      'user-1',
    );
  });

  it('findActiveAssignment() queries the effective range around asOfDate', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockAssignmentRow]);
    const result = await service.findActiveAssignment('student-1', 'year-1', '2026-04-20');
    expect(tenantPrisma.query).toHaveBeenCalledWith(
      expect.stringContaining('effective_from <= $3::date'),
      'student-1',
      'year-1',
      '2026-04-20',
    );
    expect(result).toEqual(mockAssignmentRow);
  });

  it('findActiveAssignment() returns null when nothing covers asOfDate', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
    const result = await service.findActiveAssignment('student-1', 'year-1', '2026-04-20');
    expect(result).toBeNull();
  });
});
