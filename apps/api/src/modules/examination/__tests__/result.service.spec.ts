import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ResultService } from '../result.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { GradingScaleService } from '../grading-scale.service';
import { PdfService } from '../pdf.service';
import { Role } from '../../common/enums/role.enum';

const mockTx = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

const baseExamType = {
  id: 'et-1',
  name: 'First Terminal',
  weight_percent: '100.00',
  academic_year_id: 'year-1',
  grading_scale_id: null,
  order_index: 1,
};

const baseSchedule = {
  id: 'sch-1',
  subject_id: 'sub-1',
  subject_name: 'Mathematics',
  full_marks: '100.00',
  pass_marks: '40.00',
};

const baseResultRow = {
  id: 'result-1',
  student_id: 'stu-1',
  exam_type_id: 'et-1',
  academic_year_id: 'year-1',
  total_marks: '100.00',
  obtained_marks: '80.00',
  percentage: '80.00',
  gpa: null,
  grade: null,
  division: null,
  rank_in_section: null,
  rank_in_class: null,
  is_pass: true,
  status: 'PASS',
  computed_at: new Date(),
};

// Helper to build a full computeResults mock sequence for one student
function mockOneStudent(
  marksObtained: string,
  isAbsent: boolean,
  resultRow: Record<string, unknown>,
) {
  mockTx.$queryRawUnsafe
    .mockResolvedValueOnce([baseSchedule])                          // schedules
    .mockResolvedValueOnce([baseExamType])                          // exam type
    // no thresholds (scale is null)
    .mockResolvedValueOnce([{ id: 'stu-1', section_id: 'sec-1' }]) // students
    .mockResolvedValueOnce([                                        // all marks
      {
        exam_schedule_id: 'sch-1',
        student_id: 'stu-1',
        marks_obtained: isAbsent ? null : marksObtained,
        theory_marks: null,
        practical_marks: null,
        is_absent: isAbsent,
        is_expelled: false,
      },
    ])
    .mockResolvedValueOnce([resultRow])                             // UPSERT returning
    .mockResolvedValueOnce([                                        // rank data
      { id: resultRow.id, student_id: 'stu-1', section_id: 'sec-1', obtained_marks: resultRow.obtained_marks },
    ]);
  mockTx.$executeRawUnsafe.mockResolvedValue(1);
}

describe('ResultService', () => {
  let service: ResultService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let pdf: { renderReportCard: jest.Mock };

  beforeEach(async () => {
    pdf = { renderReportCard: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 test')) };
    const module = await Test.createTestingModule({
      providers: [
        ResultService,
        GradingScaleService,
        {
          provide: TenantPrismaService,
          useValue: {
            run: jest.fn().mockImplementation((fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
            query: jest.fn(),
            execute: jest.fn(),
          },
        },
        {
          provide: TenantContextService,
          useValue: { getOrThrow: () => ({ tenantId: 't-1', slug: 'demo', schemaName: 'tenant_demo' }) },
        },
        { provide: PdfService, useValue: pdf },
      ],
    }).compile();

    service = module.get(ResultService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;

    jest.clearAllMocks();
    mockTx.$queryRawUnsafe.mockReset();
    mockTx.$executeRawUnsafe.mockReset();
    (tenantPrisma.run as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
    );
  });

  describe('computeResults()', () => {
    it('sets is_pass=false if any subject failed', async () => {
      mockOneStudent('30.00', false, { ...baseResultRow, is_pass: false, status: 'FAIL', obtained_marks: '30.00', percentage: '30.00' });

      const result = await service.computeResults({ examTypeId: 'et-1', classId: 'class-1' });

      expect(result.failed).toBe(1);
      expect(result.passed).toBe(0);

      // Verify the UPSERT was called with is_pass=false
      const upsertCall = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls.find(
        ([sql]: [string]) => sql?.includes('INSERT INTO student_results'),
      );
      expect(upsertCall).toBeDefined();
      const isPassed = upsertCall![9]; // param index 9: is_pass ($9 in SQL)
      expect(isPassed).toBe(false);
    });

    it('sets status=ABSENT if any subject absent', async () => {
      mockOneStudent('0.00', true, { ...baseResultRow, is_pass: false, status: 'ABSENT', obtained_marks: '0.00', percentage: '0.00' });

      const result = await service.computeResults({ examTypeId: 'et-1', classId: 'class-1' });

      expect(result.absent).toBe(1);

      const upsertCall = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls.find(
        ([sql]: [string]) => sql?.includes('INSERT INTO student_results'),
      );
      expect(upsertCall).toBeDefined();
      const status = upsertCall![10]; // param index 10: status ($10 in SQL)
      expect(status).toBe('ABSENT');
    });

    it('calculates percentage correctly', async () => {
      // 80/100 = 80%
      mockOneStudent('80.00', false, { ...baseResultRow, obtained_marks: '80.00', percentage: '80.00' });

      await service.computeResults({ examTypeId: 'et-1', classId: 'class-1' });

      const upsertCall = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls.find(
        ([sql]: [string]) => sql?.includes('INSERT INTO student_results'),
      );
      expect(upsertCall).toBeDefined();
      const percentage = upsertCall![6]; // 7th param: percentage
      expect(Number(percentage)).toBeCloseTo(80, 1);
    });

    it('assigns rank_in_section correctly (1st, 2nd, 3rd)', async () => {
      // 3 students in same section, marks 90, 80, 60
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([baseSchedule])
        .mockResolvedValueOnce([baseExamType])
        .mockResolvedValueOnce([
          { id: 'stu-a', section_id: 'sec-1' },
          { id: 'stu-b', section_id: 'sec-1' },
          { id: 'stu-c', section_id: 'sec-1' },
        ])
        .mockResolvedValueOnce([
          { exam_schedule_id: 'sch-1', student_id: 'stu-a', marks_obtained: '90.00', theory_marks: null, practical_marks: null, is_absent: false, is_expelled: false },
          { exam_schedule_id: 'sch-1', student_id: 'stu-b', marks_obtained: '80.00', theory_marks: null, practical_marks: null, is_absent: false, is_expelled: false },
          { exam_schedule_id: 'sch-1', student_id: 'stu-c', marks_obtained: '60.00', theory_marks: null, practical_marks: null, is_absent: false, is_expelled: false },
        ])
        // UPSERT results for 3 students
        .mockResolvedValueOnce([{ ...baseResultRow, id: 'res-a', student_id: 'stu-a', obtained_marks: '90.00', percentage: '90.00' }])
        .mockResolvedValueOnce([{ ...baseResultRow, id: 'res-b', student_id: 'stu-b', obtained_marks: '80.00', percentage: '80.00' }])
        .mockResolvedValueOnce([{ ...baseResultRow, id: 'res-c', student_id: 'stu-c', obtained_marks: '60.00', percentage: '60.00' }])
        // rank data: sorted by obtained_marks DESC
        .mockResolvedValueOnce([
          { id: 'res-a', student_id: 'stu-a', section_id: 'sec-1', obtained_marks: '90.00' },
          { id: 'res-b', student_id: 'stu-b', section_id: 'sec-1', obtained_marks: '80.00' },
          { id: 'res-c', student_id: 'stu-c', section_id: 'sec-1', obtained_marks: '60.00' },
        ]);
      mockTx.$executeRawUnsafe.mockResolvedValue(1);

      const result = await service.computeResults({ examTypeId: 'et-1', classId: 'class-1' });

      expect(result.computed).toBe(3);

      // Rank UPDATE calls — verify class rank 1,2,3 and section rank 1,2,3
      const rankUpdates = (mockTx.$executeRawUnsafe as jest.Mock).mock.calls.filter(
        ([sql]: [string]) => sql?.includes('rank_in_class'),
      );
      expect(rankUpdates).toHaveLength(3);
      expect(rankUpdates[0][1]).toBe(1); // res-a: class rank 1
      expect(rankUpdates[0][2]).toBe(1); // res-a: section rank 1
      expect(rankUpdates[1][1]).toBe(2); // res-b: class rank 2
      expect(rankUpdates[2][1]).toBe(3); // res-c: class rank 3
    });

    it('is idempotent — UPSERT uses ON CONFLICT DO UPDATE', async () => {
      mockOneStudent('75.00', false, { ...baseResultRow, obtained_marks: '75.00', percentage: '75.00' });

      await service.computeResults({ examTypeId: 'et-1', classId: 'class-1' });

      const upsertCall = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls.find(
        ([sql]: [string]) => sql?.includes('INSERT INTO student_results'),
      );
      expect(upsertCall).toBeDefined();
      expect(upsertCall![0]).toContain('ON CONFLICT');
      expect(upsertCall![0]).toContain('DO UPDATE');
    });
  });

  describe('getReportCard()', () => {
    it('returns all exam types with subject breakdown', async () => {
      // Student info
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{
          id: 'stu-1',
          student_id: 'STU-001',
          first_name: 'Ram',
          last_name: 'Sharma',
          roll_number: 1,
          section_id: 'sec-1',
          section_name: 'A',
          class_name: 'Class 10',
          academic_year_id: 'year-1',
          academic_year_name: '2081',
        }])
        // results for student
        .mockResolvedValueOnce([
          { ...baseResultRow, id: 'result-1', exam_type_id: 'et-1' },
        ])
        // subject results for result-1
        .mockResolvedValueOnce([{
          id: 'ssr-1',
          student_result_id: 'result-1',
          subject_id: 'sub-1',
          subject_name: 'Mathematics',
          full_marks: '100.00',
          marks_obtained: '80.00',
          theory_marks: null,
          practical_marks: null,
          is_absent: false,
          percentage: '80.00',
          grade: null,
          is_pass: true,
          created_at: new Date(),
        }])
        // exam types for academic year
        .mockResolvedValueOnce([{
          id: 'et-1',
          name: 'First Terminal',
          weight_percent: '100.00',
          academic_year_id: 'year-1',
          grading_scale_id: null,
          order_index: 1,
          results_published_at: null,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        }])
        .mockResolvedValueOnce([]); // no default grading scale → annual grade stays null

      const reportCard = await service.getReportCard('stu-1');

      expect(reportCard.student.id).toBe('stu-1');
      expect(reportCard.examResults).toHaveLength(1);
      expect(reportCard.examResults[0].subjects).toHaveLength(1);
      expect(reportCard.examResults[0].subjects[0].subjectName).toBe('Mathematics');
    });

    it('calculates annualResult weightedPercentage correctly (20%+30%+50%)', async () => {
      const resultRows = [
        { ...baseResultRow, id: 'result-1', exam_type_id: 'et-1', percentage: '70.00', obtained_marks: '70.00' },
        { ...baseResultRow, id: 'result-2', exam_type_id: 'et-2', percentage: '80.00', obtained_marks: '80.00' },
        { ...baseResultRow, id: 'result-3', exam_type_id: 'et-3', percentage: '90.00', obtained_marks: '90.00' },
      ];
      const examTypeRows = [
        { id: 'et-1', name: 'First Terminal',  weight_percent: '20.00', academic_year_id: 'year-1', grading_scale_id: null, order_index: 1, results_published_at: new Date(), created_at: new Date(), updated_at: new Date(), deleted_at: null },
        { id: 'et-2', name: 'Second Terminal', weight_percent: '30.00', academic_year_id: 'year-1', grading_scale_id: null, order_index: 2, results_published_at: new Date(), created_at: new Date(), updated_at: new Date(), deleted_at: null },
        { id: 'et-3', name: 'Final',           weight_percent: '50.00', academic_year_id: 'year-1', grading_scale_id: null, order_index: 3, results_published_at: new Date(), created_at: new Date(), updated_at: new Date(), deleted_at: null },
      ];

      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{
          id: 'stu-1', student_id: 'STU-001', first_name: 'Ram', last_name: 'Sharma',
          roll_number: 1, section_id: 'sec-1', section_name: 'A', class_name: 'Class 10',
          academic_year_id: 'year-1', academic_year_name: '2081',
        }])
        .mockResolvedValueOnce(resultRows)
        .mockResolvedValueOnce([]) // subject results for result-1
        .mockResolvedValueOnce([]) // subject results for result-2
        .mockResolvedValueOnce([]) // subject results for result-3
        .mockResolvedValueOnce(examTypeRows)
        .mockResolvedValueOnce([{ id: 'scale-1' }]) // default grading scale
        .mockResolvedValueOnce([ // thresholds
          { grade: 'A', gpa_point: '3.6', min_percent: '80.00', max_percent: '100.00', remarks: null },
          { grade: 'B', gpa_point: '3.0', min_percent: '60.00', max_percent: '79.99', remarks: null },
        ]);

      const reportCard = await service.getReportCard('stu-1');

      // weighted avg = (20*70 + 30*80 + 50*90) / (20+30+50) = 8300/100 = 83
      expect(reportCard.annualResult.weightedPercentage).toBeCloseTo(83, 1);
      // un-stubbed: finalGpa/finalGrade now populated from the default scale (83 → A / 3.6)
      expect(reportCard.annualResult.finalGrade).toBe('A');
      expect(reportCard.annualResult.finalGpa).toBeCloseTo(3.6, 2);
    });

    it('publish gate: STUDENT sees only published terms, annual computed from them', async () => {
      const resultRows = [
        { ...baseResultRow, id: 'result-1', exam_type_id: 'et-1', percentage: '70.00', obtained_marks: '70.00' },
        { ...baseResultRow, id: 'result-2', exam_type_id: 'et-2', percentage: '90.00', obtained_marks: '90.00' },
      ];
      const examTypeRows = [
        { id: 'et-1', name: 'First Terminal', weight_percent: '40.00', academic_year_id: 'year-1', grading_scale_id: null, order_index: 1, results_published_at: new Date(), created_at: new Date(), updated_at: new Date(), deleted_at: null },
        { id: 'et-2', name: 'Final', weight_percent: '60.00', academic_year_id: 'year-1', grading_scale_id: null, order_index: 2, results_published_at: null, created_at: new Date(), updated_at: new Date(), deleted_at: null },
      ];

      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{
          id: 'stu-1', student_id: 'STU-001', first_name: 'Ram', last_name: 'Sharma',
          roll_number: 1, section_id: 'sec-1', section_name: 'A', class_name: 'Class 10',
          academic_year_id: 'year-1', academic_year_name: '2081',
        }])
        .mockResolvedValueOnce(resultRows)
        .mockResolvedValueOnce([]) // subjects result-1
        .mockResolvedValueOnce([]) // subjects result-2
        .mockResolvedValueOnce(examTypeRows)
        .mockResolvedValueOnce([]); // no default scale

      const reportCard = await service.getReportCard('stu-1', 'student-user', Role.STUDENT);

      // Only the published term (et-1) is visible
      expect(reportCard.examResults).toHaveLength(1);
      expect(reportCard.examResults[0].examType.id).toBe('et-1');
      // annual computed from the visible term only: 40*70/40 = 70
      expect(reportCard.annualResult.weightedPercentage).toBeCloseTo(70, 1);
    });
  });

  describe('buildReportCardPdf()', () => {
    it('throws 409 when no terms are published (clean "not available yet", not an empty PDF)', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{
          id: 'stu-1', student_id: 'STU-001', first_name: 'Ram', last_name: 'Sharma',
          roll_number: 1, section_id: 'sec-1', section_name: 'A', class_name: 'Class 10',
          academic_year_id: 'year-1', academic_year_name: '2081',
        }])
        .mockResolvedValueOnce([]) // no student_results
        .mockResolvedValueOnce([]); // exam types

      await expect(
        service.buildReportCardPdf('stu-1', 'student-user', Role.STUDENT),
      ).rejects.toThrow(ConflictException);
      expect(pdf.renderReportCard).not.toHaveBeenCalled();
    });

    it('renders a PDF (with school name) when published terms exist', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{
          id: 'stu-1', student_id: 'STU-001', first_name: 'Ram', last_name: 'Sharma',
          roll_number: 1, section_id: 'sec-1', section_name: 'A', class_name: 'Class 10',
          academic_year_id: 'year-1', academic_year_name: '2081',
        }])
        .mockResolvedValueOnce([{ ...baseResultRow, id: 'r-1', exam_type_id: 'et-1', percentage: '80.00' }])
        .mockResolvedValueOnce([]) // subjects for r-1
        .mockResolvedValueOnce([{ id: 'et-1', name: 'First Terminal', weight_percent: '100.00', academic_year_id: 'year-1', grading_scale_id: null, order_index: 1, results_published_at: new Date(), created_at: new Date(), updated_at: new Date(), deleted_at: null }])
        .mockResolvedValueOnce([{ id: 'scale-1' }]) // default scale
        .mockResolvedValueOnce([{ grade: 'A', gpa_point: '3.6', min_percent: '80.00', max_percent: '100.00', remarks: null }]) // thresholds
        .mockResolvedValueOnce([{ name: 'Motherland School' }]); // getSchoolName

      const result = await service.buildReportCardPdf('stu-1', 'student-user', Role.STUDENT);

      expect(pdf.renderReportCard).toHaveBeenCalledTimes(1);
      expect(pdf.renderReportCard.mock.calls[0][1]).toEqual({ schoolName: 'Motherland School' });
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.fileName).toBe('report-card-Ram-Sharma.pdf');
    });
  });

  describe('IDOR protection — PARENT role', () => {
    it('getStudentResults throws ForbiddenException when student is not the caller\'s child', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]); // guardians returns no match

      await expect(
        service.getStudentResults('other-student', 'parent-uuid', Role.PARENT),
      ).rejects.toThrow(ForbiddenException);
    });

    it('getStudentResults skips IDOR check for non-PARENT roles', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]); // student_results query

      const result = await service.getStudentResults('any-student', 'teacher-uuid', Role.TEACHER);

      expect(result).toEqual([]);
    });

    it('getReportCard throws ForbiddenException for PARENT when studentId is not a valid UUID', async () => {
      await expect(
        service.getReportCard('ADM-2082-001', 'parent-uuid', Role.PARENT),
      ).rejects.toThrow(ForbiddenException);
    });

    it('getReportCard throws ForbiddenException when UUID student is not the caller\'s child', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]); // guardians returns no match

      await expect(
        service.getReportCard('550e8400-e29b-41d4-a716-446655440000', 'parent-uuid', Role.PARENT),
      ).rejects.toThrow(ForbiddenException);
    });

    // POL-1 T3: the PDF variant shares getReportCard's hard-scope — a PARENT
    // probing another family's child gets 403 before any PDF work happens.
    it('buildReportCardPdf throws ForbiddenException for a cross-family PARENT probe', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]); // guardians returns no match

      await expect(
        service.buildReportCardPdf('550e8400-e29b-41d4-a716-446655440000', 'parent-uuid', Role.PARENT),
      ).rejects.toThrow(ForbiddenException);
      expect(pdf.renderReportCard).not.toHaveBeenCalled();
    });
  });
});
