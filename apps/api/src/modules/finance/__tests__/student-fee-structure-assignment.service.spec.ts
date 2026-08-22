import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StudentFeeStructureAssignmentService } from '../student-fee-structure-assignment.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { guardSurvivingMocks } from '../../../testing/mock-leak-guard';

const mockTx = guardSurvivingMocks({
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
});

const mockAssignmentRow = {
  id: 'sfsa-1',
  student_id: 'student-1',
  fee_structure_id: 'bfs-1',
  academic_year_id: 'year-1',
  effective_from: new Date('2026-04-14'),
  effective_to: null,
  assigned_by: 'user-1',
  class_mismatch_overridden: false,
  overridden_by_user_id: null,
  overridden_at: null,
  created_at: new Date('2026-04-14'),
  updated_at: new Date('2026-04-14'),
  deleted_at: null,
};

// FEE-CLASS-GUARD: both lookups now carry class/section + display names.
const structureRow = (over: Record<string, unknown> = {}) => ({
  id: 'bfs-1',
  academic_year_id: 'year-1',
  class_id: 'class-1',
  section_id: null,
  class_name: 'Grade 1',
  section_name: null,
  ...over,
});

const studentRow = (over: Record<string, unknown> = {}) => ({
  id: 'student-1',
  class_id: 'class-1',
  section_id: 'section-a',
  class_name: 'Grade 1',
  section_name: 'A',
  ...over,
});

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
      .mockResolvedValueOnce([structureRow()]) // structure found
      .mockResolvedValueOnce([]); // student not found
    await expect(
      service.assign('missing-student', { feeStructureId: 'bfs-1', effectiveFrom: '2026-04-14' }, 'user-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('assign() closes any existing OPEN assignment before inserting the new one', async () => {
    mockTx.$queryRawUnsafe
      .mockResolvedValueOnce([structureRow()]) // structure
      .mockResolvedValueOnce([studentRow()]) // student (same class -> no mismatch)
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
      false, // class_mismatch_overridden — matching assignment, no stamp
    );
  });

  // ─── FEE-CLASS-GUARD ────────────────────────────────────────────────────────

  it('assign() rejects a class mismatch with 422 CLASS_MISMATCH and writes nothing', async () => {
    mockTx.$queryRawUnsafe
      .mockResolvedValueOnce([structureRow()]) // Grade 1 structure
      .mockResolvedValueOnce([studentRow({ class_id: 'class-5', class_name: 'Grade 5' })]);

    await expect(
      service.assign('student-1', { feeStructureId: 'bfs-1', effectiveFrom: '2026-04-14' }, 'user-1'),
    ).rejects.toMatchObject({
      constructor: UnprocessableEntityException,
      response: {
        code: 'CLASS_MISMATCH',
        details: {
          feeStructure: { id: 'bfs-1', className: 'Grade 1', sectionName: null },
          target: { studentId: 'student-1', className: 'Grade 5', sectionName: 'A' },
        },
      },
    });
    // Neither the close-out UPDATE nor the INSERT ran.
    expect(mockTx.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(mockTx.$queryRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it('assign() proceeds and stamps the override when allowCrossClassAssignment is set', async () => {
    mockTx.$queryRawUnsafe
      .mockResolvedValueOnce([structureRow()])
      .mockResolvedValueOnce([studentRow({ class_id: 'class-5', class_name: 'Grade 5' })])
      .mockResolvedValueOnce([]) // BILL-DATA-1 open-row check: none open
      .mockResolvedValueOnce([{ ...mockAssignmentRow, class_mismatch_overridden: true }]);

    const result = await service.assign(
      'student-1',
      { feeStructureId: 'bfs-1', effectiveFrom: '2026-04-14', allowCrossClassAssignment: true },
      'user-1',
    );

    expect(result.classMismatchOverridden).toBe(true);
    expect(mockTx.$queryRawUnsafe).toHaveBeenLastCalledWith(
      expect.stringContaining('class_mismatch_overridden'),
      'student-1',
      'bfs-1',
      'year-1',
      '2026-04-14',
      'user-1',
      true,
    );
  });

  it('assign() does NOT stamp an override when the flag is passed on a matching assignment', async () => {
    mockTx.$queryRawUnsafe
      .mockResolvedValueOnce([structureRow()])
      .mockResolvedValueOnce([studentRow()]) // same class -> no mismatch
      .mockResolvedValueOnce([]) // BILL-DATA-1 open-row check: none open
      .mockResolvedValueOnce([mockAssignmentRow]);

    await service.assign(
      'student-1',
      { feeStructureId: 'bfs-1', effectiveFrom: '2026-04-14', allowCrossClassAssignment: true },
      'user-1',
    );

    expect(mockTx.$queryRawUnsafe).toHaveBeenLastCalledWith(
      expect.any(String), 'student-1', 'bfs-1', 'year-1', '2026-04-14', 'user-1', false,
    );
  });

  it('assign() allows a new effectiveFrom when there is no currently-open row', async () => {
    mockTx.$queryRawUnsafe
      .mockResolvedValueOnce([structureRow()]) // structure
      .mockResolvedValueOnce([studentRow()]) // student (same class -> no mismatch)
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
      .mockResolvedValueOnce([structureRow()]) // structure
      .mockResolvedValueOnce([studentRow()]) // student (same class -> no mismatch)
      .mockResolvedValueOnce([{ effective_from: '2026-08-16' }]); // currently-open row, LATER than new date

    await expect(
      service.assign('student-1', { feeStructureId: 'bfs-1', effectiveFrom: '2026-04-13' }, 'user-1'),
    ).rejects.toThrow(BadRequestException);
    expect(mockTx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('assign() rejects a same-day re-assignment (would produce a 1-day-inverted close)', async () => {
    mockTx.$queryRawUnsafe
      .mockResolvedValueOnce([structureRow()]) // structure
      .mockResolvedValueOnce([studentRow()]) // student (same class -> no mismatch)
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
