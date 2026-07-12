import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { pct, toNum } from './report.util';

/**
 * REP-1 T2 — exam analytics over the ALREADY-COMPUTED result pipeline
 * (student_results / student_subject_results; grades and pass flags were
 * applied at computation time — zero recomputation here).
 *
 * Privacy boundary: ONLY exams with exam_types.results_published_at IS NOT
 * NULL are visible anywhere in this service (the publish edge).
 */
@Injectable()
export class ExamReportService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** Published exams for the picker (id, name, year, published_at). */
  async listPublishedExams(academicYearId?: string) {
    const rows = await this.tenantPrisma.query<{
      id: string;
      name: string;
      academic_year_id: string;
      results_published_at: Date;
    }>(
      `SELECT id, name, academic_year_id, results_published_at
       FROM exam_types
       WHERE deleted_at IS NULL AND results_published_at IS NOT NULL
         AND ($1::uuid IS NULL OR academic_year_id = $1::uuid)
       ORDER BY order_index`,
      academicYearId ?? null,
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      academicYearId: r.academic_year_id,
      publishedAt: r.results_published_at.toISOString(),
    }));
  }

  private async assertPublished(examTypeId: string): Promise<void> {
    const rows = await this.tenantPrisma.query<{ ok: number }>(
      `SELECT 1 AS ok FROM exam_types
       WHERE id = $1::uuid AND deleted_at IS NULL AND results_published_at IS NOT NULL`,
      examTypeId,
    );
    // Unpublished and nonexistent are indistinguishable on purpose.
    if (rows.length === 0) throw new NotFoundException('Exam not found or not published.');
  }

  /** Per-subject aggregates + grade distribution for one published exam. */
  async getSummary(examTypeId: string, classId?: string) {
    await this.assertPublished(examTypeId);

    const subjects = await this.tenantPrisma.query<{
      subject_id: string;
      subject_name: string;
      appeared: string;
      average: string | null;
      highest: string | null;
      lowest: string | null;
      passed: string;
    }>(
      `SELECT ssr.subject_id, ssr.subject_name,
              COUNT(*) FILTER (WHERE NOT ssr.is_absent)          AS appeared,
              AVG(ssr.marks_obtained) FILTER (WHERE NOT ssr.is_absent) AS average,
              MAX(ssr.marks_obtained) FILTER (WHERE NOT ssr.is_absent) AS highest,
              MIN(ssr.marks_obtained) FILTER (WHERE NOT ssr.is_absent) AS lowest,
              COUNT(*) FILTER (WHERE ssr.is_pass)                AS passed
       FROM student_subject_results ssr
       JOIN student_results sr ON sr.id = ssr.student_result_id
       JOIN students s ON s.id = sr.student_id AND s.deleted_at IS NULL
       WHERE sr.exam_type_id = $1::uuid
         AND ($2::uuid IS NULL OR s.class_id = $2::uuid)
       GROUP BY ssr.subject_id, ssr.subject_name
       ORDER BY ssr.subject_name`,
      examTypeId,
      classId ?? null,
    );

    const grades = await this.tenantPrisma.query<{ grade: string | null; count: string }>(
      `SELECT sr.grade, COUNT(*) AS count
       FROM student_results sr
       JOIN students s ON s.id = sr.student_id AND s.deleted_at IS NULL
       WHERE sr.exam_type_id = $1::uuid
         AND ($2::uuid IS NULL OR s.class_id = $2::uuid)
       GROUP BY sr.grade
       ORDER BY sr.grade`,
      examTypeId,
      classId ?? null,
    );

    const overall = await this.tenantPrisma.query<{
      students: string;
      passed: string;
      avg_percentage: string | null;
    }>(
      `SELECT COUNT(*) AS students,
              COUNT(*) FILTER (WHERE sr.is_pass) AS passed,
              AVG(sr.percentage) AS avg_percentage
       FROM student_results sr
       JOIN students s ON s.id = sr.student_id AND s.deleted_at IS NULL
       WHERE sr.exam_type_id = $1::uuid
         AND ($2::uuid IS NULL OR s.class_id = $2::uuid)`,
      examTypeId,
      classId ?? null,
    );

    const totalStudents = parseInt(overall[0]?.students ?? '0', 10);
    const passedStudents = parseInt(overall[0]?.passed ?? '0', 10);

    return {
      examTypeId,
      students: totalStudents,
      passRate: pct(passedStudents, totalStudents),
      averagePercentage: overall[0]?.avg_percentage
        ? Math.round(toNum(overall[0].avg_percentage) * 10) / 10
        : null,
      subjects: subjects.map((r) => {
        const appeared = parseInt(r.appeared, 10);
        return {
          subjectId: r.subject_id,
          subjectName: r.subject_name,
          appeared,
          average: r.average !== null ? Math.round(toNum(r.average) * 10) / 10 : null,
          highest: r.highest !== null ? toNum(r.highest) : null,
          lowest: r.lowest !== null ? toNum(r.lowest) : null,
          passRate: pct(parseInt(r.passed, 10), appeared),
        };
      }),
      gradeDistribution: grades.map((g) => ({
        grade: g.grade ?? '—',
        count: parseInt(g.count, 10),
      })),
    };
  }

  /** Class/section comparison for one published exam. */
  async getComparison(examTypeId: string) {
    await this.assertPublished(examTypeId);
    const rows = await this.tenantPrisma.query<{
      class_name: string | null;
      section_name: string | null;
      students: string;
      passed: string;
      avg_percentage: string | null;
    }>(
      `SELECT s.class_name, s.section_name,
              COUNT(*) AS students,
              COUNT(*) FILTER (WHERE sr.is_pass) AS passed,
              AVG(sr.percentage) AS avg_percentage
       FROM student_results sr
       JOIN students s ON s.id = sr.student_id AND s.deleted_at IS NULL
       WHERE sr.exam_type_id = $1::uuid
       GROUP BY s.class_name, s.section_name
       ORDER BY s.class_name, s.section_name`,
      examTypeId,
    );
    return rows.map((r) => {
      const students = parseInt(r.students, 10);
      return {
        className: r.class_name,
        sectionName: r.section_name,
        students,
        passRate: pct(parseInt(r.passed, 10), students),
        averagePercentage: r.avg_percentage
          ? Math.round(toNum(r.avg_percentage) * 10) / 10
          : null,
      };
    });
  }

  /** One student across ALL published exams of a year (progress line). */
  async getStudentProgress(studentId: string, academicYearId?: string) {
    const rows = await this.tenantPrisma.query<{
      exam_type_id: string;
      exam_name: string;
      order_index: number;
      percentage: string;
      gpa: string | null;
      grade: string | null;
      is_pass: boolean;
      rank_in_section: number | null;
    }>(
      `SELECT et.id AS exam_type_id, et.name AS exam_name, et.order_index,
              sr.percentage, sr.gpa, sr.grade, sr.is_pass, sr.rank_in_section
       FROM student_results sr
       JOIN exam_types et ON et.id = sr.exam_type_id
         AND et.deleted_at IS NULL AND et.results_published_at IS NOT NULL
       WHERE sr.student_id = $1::uuid
         AND ($2::uuid IS NULL OR sr.academic_year_id = $2::uuid)
       ORDER BY et.order_index`,
      studentId,
      academicYearId ?? null,
    );
    return rows.map((r) => ({
      examTypeId: r.exam_type_id,
      examName: r.exam_name,
      percentage: toNum(r.percentage),
      gpa: r.gpa !== null ? toNum(r.gpa) : null,
      grade: r.grade,
      isPass: r.is_pass,
      rankInSection: r.rank_in_section,
    }));
  }
}
