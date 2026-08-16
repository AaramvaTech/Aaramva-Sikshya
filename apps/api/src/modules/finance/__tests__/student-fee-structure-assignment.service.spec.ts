import { BadRequestException, NotFoundException } from '@nestjs/common';
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
      .mockResolvedValueOnce([{ effective_from: '2026-01-01' }]) // currently-open row, earlier than new date
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

  it('assign() allows a new effectiveFrom when there is no currently-open row', async () => {
    mockTx.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'bfs-1', academic_year_id: 'year-1' }]) // structure
      .mockResolvedValueOnce([{ id: 'student-1' }]) // student
      .mockResolvedValueOnce([]) // no open row
      .mockResolvedValueOnce([mockAssignmentRow]); // insert RETURNING

    const result = await service.assign(
      'student-1',
      { feeStructureId: 'bfs-1', effectiveFrom: '2026-04-14' },
      'user-1',
    );

    expect(result.id).toBe('sfsa-1');
  });

  // BILL-DATA-1 Phase 3: the exact bug found in motherland-school — a
  // backdated re-assign() call closing the currently-open row with
  // effective_to < effective_from.
  it('assign() rejects a backdated effectiveFrom that would invert the row being closed', async () => {
    mockTx.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'bfs-1', academic_year_id: 'year-1' }]) // structure
      .mockResolvedValueOnce([{ id: 'student-1' }]) // student
      .mockResolvedValueOnce([{ effective_from: '2026-08-16' }]); // currently-open row, LATER than new date

    await expect(
      service.assign('student-1', { feeStructureId: 'bfs-1', effectiveFrom: '2026-04-13' }, 'user-1'),
    ).rejects.toThrow(BadRequestException);
    expect(mockTx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('assign() rejects a same-day re-assignment (would produce a 1-day-inverted close)', async () => {
    mockTx.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'bfs-1', academic_year_id: 'year-1' }]) // structure
      .mockResolvedValueOnce([{ id: 'student-1' }]) // student
      .mockResolvedValueOnce([{ effective_from: '2026-04-13' }]); // currently-open row, SAME date

    await expect(
      service.assign('student-1', { feeStructureId: 'bfs-1', effectiveFrom: '2026-04-13' }, 'user-1'),
    ).rejects.toThrow(BadRequestException);
    expect(mockTx.$executeRawUnsafe).not.toHaveBeenCalled();
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

  describe('findAllForStudent', () => {
    it('lists every assignment for the student ordered newest-first, no academicYearId filter', async () => {
      const closedRow = { ...mockAssignmentRow, id: 'sfsa-0', effective_to: '2026-04-13' };
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockAssignmentRow, closedRow]);

      const result = await service.findAllForStudent('student-1');

      expect(tenantPrisma.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY effective_from DESC'),
        'student-1',
      );
      expect(tenantPrisma.query).not.toHaveBeenCalledWith(expect.stringContaining('academic_year_id = $2'), expect.anything());
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('sfsa-1');
      expect(result[0].effectiveTo).toBeNull();
      expect(result[1].effectiveTo).toBe('2026-04-13');
    });

    it('filters by academicYearId when given', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockAssignmentRow]);

      const result = await service.findAllForStudent('student-1', 'year-1');

      expect(tenantPrisma.query).toHaveBeenCalledWith(
        expect.stringContaining('academic_year_id = $2::uuid'),
        'student-1',
        'year-1',
      );
      expect(result).toHaveLength(1);
    });

    it('returns an empty array for a student with no assignment history', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      const result = await service.findAllForStudent('student-1');
      expect(result).toEqual([]);
    });
  });

  describe('findAssignmentOverlappingPeriod', () => {
    it('finds an assignment whose effective_from starts mid-period (BILL-4 proration)', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockAssignmentRow]);
      const result = await service.findAssignmentOverlappingPeriod('student-1', 'year-1', '2026-07-16', '2026-08-15');
      expect(tenantPrisma.query).toHaveBeenCalledWith(
        expect.stringContaining('effective_from <= $4::date'),
        'student-1', 'year-1', '2026-07-16', '2026-08-15',
      );
      expect(result).toEqual(mockAssignmentRow);
    });

    it('returns null when no assignment overlaps any part of the period', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      const result = await service.findAssignmentOverlappingPeriod('student-1', 'year-1', '2026-07-16', '2026-08-15');
      expect(result).toBeNull();
    });
  });
});
