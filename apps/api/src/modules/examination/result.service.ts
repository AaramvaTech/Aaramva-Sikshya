import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { GradingScaleService } from './grading-scale.service';
import {
  ExamScheduleRow,
  ExamTypeRow,
  GradeThresholdRow,
  MarksRow,
  StudentResultRow,
  StudentSubjectResultRow,
  toExamTypeResponse,
  toStudentResultResponse,
  toNum,
} from './entities/examination.entity';
import { ComputeResultsDto } from './dto/examination.dto';

export interface ComputeSummary {
  computed: number;
  passed: number;
  failed: number;
  absent: number;
}

@Injectable()
export class ResultService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly gradingScaleService: GradingScaleService,
  ) {}

  async computeResults(dto: ComputeResultsDto): Promise<ComputeSummary> {
    return this.tenantPrisma.run(async (tx) => {
      // 1. Get schedules for this exam type + class
      const schedules = await tx.$queryRawUnsafe<(ExamScheduleRow & { subject_name: string })[]>(
        `SELECT es.*, s.name AS subject_name
         FROM exam_schedules es
         JOIN subjects s ON es.subject_id = s.id
         WHERE es.exam_type_id = $1::uuid AND es.class_id = $2::uuid AND es.deleted_at IS NULL`,
        dto.examTypeId,
        dto.classId,
      );

      if (!schedules.length) return { computed: 0, passed: 0, failed: 0, absent: 0 };

      // 2. Get exam type (for academic_year_id + grading_scale_id)
      const examTypes = await tx.$queryRawUnsafe<ExamTypeRow[]>(
        `SELECT * FROM exam_types WHERE id = $1::uuid AND deleted_at IS NULL`,
        dto.examTypeId,
      );
      if (!examTypes[0]) throw new NotFoundException(`ExamType ${dto.examTypeId} not found`);
      const examType = examTypes[0];

      // 3. Fetch thresholds once if scale exists
      let thresholds: GradeThresholdRow[] = [];
      if (examType.grading_scale_id) {
        thresholds = await tx.$queryRawUnsafe<GradeThresholdRow[]>(
          `SELECT * FROM grade_thresholds WHERE grading_scale_id = $1::uuid ORDER BY min_percent DESC`,
          examType.grading_scale_id,
        );
      }

      // 4. Get students enrolled in this class (optionally filtered by section)
      let studentSql = `
        SELECT s.id, s.section_id
        FROM students s
        JOIN sections sec ON s.section_id = sec.id
        WHERE sec.class_id = $1::uuid AND s.deleted_at IS NULL
      `;
      const studentParams: unknown[] = [dto.classId];
      if (dto.sectionId) {
        studentSql += ` AND s.section_id = $2::uuid`;
        studentParams.push(dto.sectionId);
      }
      const students = await tx.$queryRawUnsafe<{ id: string; section_id: string }[]>(
        studentSql,
        ...studentParams,
      );

      if (!students.length) return { computed: 0, passed: 0, failed: 0, absent: 0 };

      // 5. Fetch ALL marks for all students in one query
      const scheduleIds = schedules.map((s) => s.id);
      const studentIds = students.map((s) => s.id);
      const allMarks = await tx.$queryRawUnsafe<MarksRow[]>(
        `SELECT m.*
         FROM marks m
         WHERE m.exam_schedule_id = ANY($1::uuid[])
           AND m.student_id = ANY($2::uuid[])`,
        scheduleIds,
        studentIds,
      );

      // Index marks by student_id -> schedule_id
      const marksIndex = new Map<string, Map<string, MarksRow>>();
      for (const m of allMarks) {
        if (!marksIndex.has(m.student_id)) marksIndex.set(m.student_id, new Map());
        marksIndex.get(m.student_id)!.set(m.exam_schedule_id, m);
      }

      let computed = 0, passed = 0, failed = 0, absent = 0;

      // 6. Process each student
      for (const student of students) {
        const studentMarks = marksIndex.get(student.id) ?? new Map<string, MarksRow>();

        let totalMarks = 0;
        let obtainedMarks = 0;
        let hasAbsent = false;
        let hasFailedSubject = false;

        const subjectResults: {
          subject_id: string;
          subject_name: string;
          full_marks: number;
          marks_obtained: number | null;
          theory_marks: number | null;
          practical_marks: number | null;
          is_absent: boolean;
          percentage: number | null;
          grade: string | null;
          is_pass: boolean;
        }[] = [];

        for (const schedule of schedules) {
          const fullM = toNum(schedule.full_marks);
          const passM = toNum(schedule.pass_marks);
          totalMarks += fullM;

          const mark = studentMarks.get(schedule.id);
          const isAbsent = mark?.is_absent ?? false;
          const markObtained =
            !isAbsent && mark?.marks_obtained != null
              ? toNum(mark.marks_obtained)
              : null;

          if (isAbsent) hasAbsent = true;

          const obtained = markObtained ?? 0;
          obtainedMarks += obtained;

          const isSubjectPass =
            !isAbsent && markObtained !== null && markObtained >= passM;
          if (!isSubjectPass) hasFailedSubject = true;

          const subjectPct =
            fullM > 0 && markObtained !== null
              ? Math.round((markObtained / fullM) * 10000) / 100
              : null;

          const { grade: subjectGrade } = this.gradingScaleService.findGrade(
            subjectPct ?? 0,
            thresholds,
          );

          subjectResults.push({
            subject_id: schedule.subject_id,
            subject_name: (schedule as any).subject_name ?? '',
            full_marks: fullM,
            marks_obtained: markObtained,
            theory_marks: mark?.theory_marks ? toNum(mark.theory_marks) : null,
            practical_marks: mark?.practical_marks ? toNum(mark.practical_marks) : null,
            is_absent: isAbsent,
            percentage: subjectPct,
            grade: subjectPct !== null ? subjectGrade : null,
            is_pass: isSubjectPass,
          });
        }

        const percentage =
          totalMarks > 0
            ? Math.round((obtainedMarks / totalMarks) * 10000) / 100
            : 0;
        const { grade: overallGrade, gpaPoint } = this.gradingScaleService.findGrade(
          percentage,
          thresholds,
        );

        const isPassed = !hasFailedSubject && !hasAbsent;
        const status = hasAbsent ? 'ABSENT' : isPassed ? 'PASS' : 'FAIL';

        // 6a. UPSERT student_results
        const resultRows = await tx.$queryRawUnsafe<StudentResultRow[]>(
          `INSERT INTO student_results
             (student_id, exam_type_id, academic_year_id, total_marks, obtained_marks,
              percentage, gpa, grade, is_pass, status)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (student_id, exam_type_id)
           DO UPDATE SET
             total_marks     = EXCLUDED.total_marks,
             obtained_marks  = EXCLUDED.obtained_marks,
             percentage      = EXCLUDED.percentage,
             gpa             = EXCLUDED.gpa,
             grade           = EXCLUDED.grade,
             is_pass         = EXCLUDED.is_pass,
             status          = EXCLUDED.status,
             rank_in_section = NULL,
             rank_in_class   = NULL,
             computed_at     = NOW()
           RETURNING *`,
          student.id,
          dto.examTypeId,
          examType.academic_year_id,
          totalMarks,
          obtainedMarks,
          percentage,
          gpaPoint ?? null,
          overallGrade !== 'NG' ? overallGrade : null,
          isPassed,
          status,
        );
        const resultRow = resultRows[0];

        // 6b. Replace subject results
        await tx.$executeRawUnsafe(
          `DELETE FROM student_subject_results WHERE student_result_id = $1::uuid`,
          resultRow.id,
        );
        for (const sr of subjectResults) {
          await tx.$executeRawUnsafe(
            `INSERT INTO student_subject_results
               (student_result_id, subject_id, subject_name, full_marks, marks_obtained,
                theory_marks, practical_marks, is_absent, percentage, grade, is_pass)
             VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            resultRow.id,
            sr.subject_id,
            sr.subject_name,
            sr.full_marks,
            sr.marks_obtained,
            sr.theory_marks,
            sr.practical_marks,
            sr.is_absent,
            sr.percentage,
            sr.grade,
            sr.is_pass,
          );
        }

        computed++;
        if (isPassed) passed++;
        else if (status === 'ABSENT') absent++;
        else failed++;
      }

      // 7. Compute ranks
      const rankData = await tx.$queryRawUnsafe<{
        id: string;
        student_id: string;
        section_id: string;
        obtained_marks: string;
      }[]>(
        `SELECT sr.id, sr.student_id, s.section_id, sr.obtained_marks
         FROM student_results sr
         JOIN students s ON sr.student_id = s.id
         WHERE sr.exam_type_id = $1::uuid
           AND s.deleted_at IS NULL
           AND s.section_id IN (
             SELECT id FROM sections WHERE class_id = $2::uuid AND deleted_at IS NULL
           )
         ORDER BY sr.obtained_marks DESC`,
        dto.examTypeId,
        dto.classId,
      );

      // Assign class ranks
      for (let i = 0; i < rankData.length; i++) {
        const classRank = i + 1;

        // Section rank: count within same section
        const sectionResults = rankData
          .filter((r) => r.section_id === rankData[i].section_id)
          .sort((a, b) => toNum(b.obtained_marks) - toNum(a.obtained_marks));
        const sectionRank = sectionResults.findIndex((r) => r.id === rankData[i].id) + 1;

        await tx.$executeRawUnsafe(
          `UPDATE student_results SET rank_in_class = $1, rank_in_section = $2 WHERE id = $3::uuid`,
          classRank,
          sectionRank,
          rankData[i].id,
        );
      }

      return { computed, passed, failed, absent };
    });
  }

  async getClassRankList(classId: string, examTypeId: string) {
    const rows = await this.tenantPrisma.query<
      StudentResultRow & {
        student_name: string;
        admission_number: string;
        section_name: string;
      }
    >(
      `SELECT sr.*,
              s.first_name || ' ' || s.last_name AS student_name,
              s.student_id AS admission_number,
              sec.name AS section_name
       FROM student_results sr
       JOIN students s ON sr.student_id = s.id
       JOIN sections sec ON s.section_id = sec.id
       WHERE sr.exam_type_id = $1::uuid
         AND sec.class_id = $2::uuid
         AND s.deleted_at IS NULL
       ORDER BY sr.obtained_marks DESC`,
      examTypeId,
      classId,
    );

    return rows.map((r) => ({
      ...toStudentResultResponse(r),
      studentName: r.student_name,
      admissionNumber: r.admission_number,
      sectionName: r.section_name,
    }));
  }

  async getStudentResults(studentId: string) {
    const rows = await this.tenantPrisma.query<StudentResultRow & { exam_type_name: string }>(
      `SELECT sr.*, et.name AS exam_type_name
       FROM student_results sr
       JOIN exam_types et ON sr.exam_type_id = et.id
       WHERE sr.student_id = $1::uuid
       ORDER BY et.order_index ASC`,
      studentId,
    );
    return rows.map((r) => ({
      ...toStudentResultResponse(r),
      examTypeName: r.exam_type_name,
    }));
  }

  async getReportCard(studentId: string) {
    // Student info
    const students = await this.tenantPrisma.query<{
      id: string;
      student_id: string;
      first_name: string;
      last_name: string;
      roll_number: number | null;
      section_id: string;
      section_name: string;
      class_name: string;
      academic_year_id: string;
      academic_year_name: string;
    }>(
      `SELECT s.id, s.student_id, s.first_name, s.last_name, s.roll_number,
              sec.id AS section_id, sec.name AS section_name,
              c.name AS class_name,
              ay.id AS academic_year_id, ay.name AS academic_year_name
       FROM students s
       JOIN sections sec ON s.section_id = sec.id
       JOIN classes c ON sec.class_id = c.id
       LEFT JOIN academic_years ay ON ay.is_current = true AND ay.deleted_at IS NULL
       WHERE s.id = $1::uuid AND s.deleted_at IS NULL`,
      studentId,
    );
    if (!students[0]) throw new NotFoundException(`Student ${studentId} not found`);
    const student = students[0];

    // Get all results for this student
    const results = await this.tenantPrisma.query<StudentResultRow>(
      `SELECT * FROM student_results WHERE student_id = $1::uuid ORDER BY computed_at DESC`,
      studentId,
    );

    // Get subject results for each result
    const examResultsWithSubjects = await Promise.all(
      results.map(async (r) => {
        const subjectRows = await this.tenantPrisma.query<StudentSubjectResultRow>(
          `SELECT * FROM student_subject_results WHERE student_result_id = $1::uuid ORDER BY subject_name ASC`,
          r.id,
        );
        return {
          resultId: r.id,
          examTypeId: r.exam_type_id,
          percentage: toNum(r.percentage),
          grade: r.grade,
          gpa: r.gpa ? toNum(r.gpa) : null,
          rankInSection: r.rank_in_section,
          rankInClass: r.rank_in_class,
          isPassed: r.is_pass,
          status: r.status,
          subjects: subjectRows.map((sr) => ({
            subjectId: sr.subject_id,
            subjectName: sr.subject_name,
            fullMarks: toNum(sr.full_marks),
            marksObtained: sr.marks_obtained ? toNum(sr.marks_obtained) : null,
            theoryMarks: sr.theory_marks ? toNum(sr.theory_marks) : null,
            practicalMarks: sr.practical_marks ? toNum(sr.practical_marks) : null,
            percentage: sr.percentage ? toNum(sr.percentage) : null,
            grade: sr.grade ?? null,
            isPassed: sr.is_pass,
            isAbsent: sr.is_absent,
          })),
        };
      }),
    );

    // Get exam types for this academic year (for weight info and annual calc)
    const examTypes = await this.tenantPrisma.query<ExamTypeRow>(
      `SELECT * FROM exam_types
       WHERE academic_year_id = $1::uuid AND deleted_at IS NULL
       ORDER BY order_index ASC`,
      student.academic_year_id,
    );

    // Build exam results with type info
    const examResults = examResultsWithSubjects.map((er) => {
      const examType = examTypes.find((et) => et.id === er.examTypeId);
      return {
        examType: examType ? toExamTypeResponse(examType) : { id: er.examTypeId },
        percentage: er.percentage,
        grade: er.grade,
        gpa: er.gpa,
        rankInSection: er.rankInSection,
        rankInClass: er.rankInClass,
        isPassed: er.isPassed,
        status: er.status,
        subjects: er.subjects,
      };
    });

    // Calculate annual result (weighted)
    let weightedTotal = 0;
    let totalWeight = 0;
    let allPassed = true;
    for (const er of examResultsWithSubjects) {
      const examType = examTypes.find((et) => et.id === er.examTypeId);
      if (examType) {
        const weight = toNum(examType.weight_percent);
        weightedTotal += (weight * er.percentage) / 100;
        totalWeight += weight;
        if (!er.isPassed) allPassed = false;
      }
    }

    const weightedPercentage = totalWeight > 0 ? Math.round(weightedTotal * 100) / 100 : 0;
    const division =
      weightedPercentage >= 60
        ? 'First Division'
        : weightedPercentage >= 45
        ? 'Second Division'
        : weightedPercentage >= 32
        ? 'Third Division'
        : 'Fail';

    return {
      student: {
        id: student.id,
        admissionNumber: student.student_id,
        fullName: `${student.first_name} ${student.last_name}`,
        rollNumber: student.roll_number,
        className: student.class_name,
        sectionName: student.section_name,
        academicYear: student.academic_year_name,
      },
      examResults,
      annualResult: {
        weightedPercentage,
        finalGrade: null,
        finalGpa: null,
        division,
        isPassed: allPassed && examResults.length > 0,
      },
    };
  }
}
