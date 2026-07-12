import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { StorageService } from '../storage/storage.service';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../auth/auth.types';
import {
  AssignmentRow,
  SubmissionRow,
  toAssignmentResponse,
  toSubmissionResponse,
} from './entities/assignment.entity';
import {
  AssignmentQueryDto,
  ReviewSubmissionDto,
  SubmissionPresignDto,
  SubmitAssignmentDto,
} from './dto/assignment.dto';
import { computeSubmissionStatus } from './assignment.util';

interface EnrolledStudent {
  id: string;
  class_id: string | null;
  section_id: string | null;
}

/**
 * EDU-1 student/parent/review side — HARD-scoped (the /me discipline):
 * students resolve ONLY via token.userId → students.user_id; parents ONLY via
 * guardians.user_id. No /me route accepts a studentId param.
 */
@Injectable()
export class SubmissionService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly storage: StorageService,
    private readonly events: EventEmitter2,
  ) {}

  // ─── Hard-scope resolvers ───────────────────────────────────────────────────

  private async resolveOwnStudent(user: AuthUser): Promise<EnrolledStudent> {
    const rows = await this.tenantPrisma.query<EnrolledStudent>(
      `SELECT id, class_id, section_id FROM students
       WHERE user_id = $1::uuid AND deleted_at IS NULL AND status = 'ACTIVE'`,
      user.userId,
    );
    if (!rows[0]) throw new NotFoundException('No active student record is linked to this account.');
    return rows[0];
  }

  /** The submit-eligibility rule: PUBLISHED + the student's enrollment is
   *  targeted (class matches; section matches unless whole-class). */
  private async resolveEligibleAssignment(
    assignmentId: string,
    student: EnrolledStudent,
  ): Promise<AssignmentRow> {
    const rows = await this.tenantPrisma.query<AssignmentRow>(
      `SELECT * FROM assignments WHERE id = $1::uuid AND deleted_at IS NULL`,
      assignmentId,
    );
    if (!rows[0]) throw new NotFoundException(`Assignment ${assignmentId} not found`);
    const a = rows[0];
    if (a.status !== 'PUBLISHED') {
      throw new ConflictException(
        a.status === 'DRAFT'
          ? 'This assignment is not published.'
          : 'This assignment is closed and no longer accepts submissions.',
      );
    }
    const targeted =
      student.class_id === a.class_id &&
      (a.section_id === null || student.section_id === a.section_id);
    if (!targeted) {
      throw new ForbiddenException('This assignment is not for your class.');
    }
    return a;
  }

  // ─── Student endpoints ──────────────────────────────────────────────────────

  async listMine(user: AuthUser, query: AssignmentQueryDto) {
    const student = await this.resolveOwnStudent(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const rows = await this.tenantPrisma.query<
      AssignmentRow & { total_count: string } & {
        my_status: string | null;
        my_submitted_at: Date | null;
        my_marks: string | null;
      }
    >(
      `SELECT a.*, c.name AS class_name, sec.name AS section_name, sub.name AS subject_name,
              (u.first_name || ' ' || u.last_name) AS teacher_name,
              s.status AS my_status, s.submitted_at AS my_submitted_at, s.marks AS my_marks,
              COUNT(*) OVER() AS total_count
       FROM assignments a
       JOIN classes c ON c.id = a.class_id
       LEFT JOIN sections sec ON sec.id = a.section_id
       JOIN subjects sub ON sub.id = a.subject_id
       JOIN users u ON u.id = a.created_by
       LEFT JOIN assignment_submissions s
         ON s.assignment_id = a.id AND s.student_id = $1::uuid
       WHERE a.deleted_at IS NULL AND a.status <> 'DRAFT'
         AND a.class_id = $2::uuid
         AND (a.section_id IS NULL OR a.section_id = $3::uuid)
       ORDER BY a.due_date DESC, a.created_at DESC
       LIMIT $4 OFFSET $5`,
      student.id,
      student.class_id,
      student.section_id,
      limit,
      (page - 1) * limit,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return {
      data: rows.map((r) => ({
        ...toAssignmentResponse(r),
        mySubmission: r.my_status
          ? {
              status: r.my_status,
              submittedAt: r.my_submitted_at?.toISOString() ?? null,
              marks: r.my_marks !== null ? Number(r.my_marks) : null,
            }
          : null,
      })),
      meta: { page, limit, total },
    };
  }

  /** Assignment-scoped presign for submission-file — THE eligibility gate the
   *  FILE-1 kind-policy marks scopedOnly. */
  async presignSubmissionUpload(
    assignmentId: string,
    dto: SubmissionPresignDto,
    user: AuthUser,
  ) {
    const student = await this.resolveOwnStudent(user);
    await this.resolveEligibleAssignment(assignmentId, student);
    const { slug } = this.tenantContext.getOrThrow();
    return this.storage.presignUpload(
      'submission-file',
      dto.contentType,
      dto.size,
      slug,
      user.role,
      { eligibilityVerified: true },
    );
  }

  async submit(assignmentId: string, dto: SubmitAssignmentDto, user: AuthUser) {
    if (!dto.textAnswer?.trim() && !dto.fileKey) {
      throw new BadRequestException('Provide a text answer, a file, or both.');
    }

    const student = await this.resolveOwnStudent(user);
    const assignment = await this.resolveEligibleAssignment(assignmentId, student);

    if (dto.fileKey) {
      const { slug } = this.tenantContext.getOrThrow();
      await this.storage.verifyConfirmedKey(dto.fileKey, 'submission-file', slug);
    }

    // Resubmission updates the live row — but never silently erases a review.
    const existing = await this.tenantPrisma.query<{ status: string }>(
      `SELECT status FROM assignment_submissions
       WHERE assignment_id = $1::uuid AND student_id = $2::uuid`,
      assignmentId,
      student.id,
    );
    if (existing[0]?.status === 'REVIEWED') {
      throw new ConflictException('This submission has been reviewed and can no longer be changed.');
    }

    // LATE = after due-date end-of-day in Asia/Kathmandu (assignment.util.ts).
    const dueDateAd = assignment.due_date.toISOString().slice(0, 10);
    const status = computeSubmissionStatus(dueDateAd, Date.now());

    const rows = await this.tenantPrisma.query<SubmissionRow>(
      `INSERT INTO assignment_submissions
         (assignment_id, student_id, text_answer, file_key, status)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5)
       ON CONFLICT (assignment_id, student_id) DO UPDATE SET
         text_answer = EXCLUDED.text_answer,
         file_key = EXCLUDED.file_key,
         status = EXCLUDED.status,
         submitted_at = NOW(),
         updated_at = NOW()
       RETURNING *`,
      assignmentId,
      student.id,
      dto.textAnswer?.trim() || null,
      dto.fileKey ?? null,
      status,
    );
    return toSubmissionResponse(rows[0]);
  }

  async getMine(assignmentId: string, user: AuthUser) {
    const student = await this.resolveOwnStudent(user);
    const rows = await this.tenantPrisma.query<SubmissionRow>(
      `SELECT * FROM assignment_submissions
       WHERE assignment_id = $1::uuid AND student_id = $2::uuid`,
      assignmentId,
      student.id,
    );
    return rows[0] ? toSubmissionResponse(rows[0]) : null;
  }

  // ─── Parent endpoint ────────────────────────────────────────────────────────

  async listForMyChildren(user: AuthUser) {
    const children = await this.tenantPrisma.query<
      EnrolledStudent & { first_name: string; last_name: string }
    >(
      `SELECT DISTINCT s.id, s.class_id, s.section_id, s.first_name, s.last_name
       FROM students s
       JOIN guardians g ON g.student_id = s.id
       WHERE g.user_id = $1::uuid AND s.deleted_at IS NULL AND s.status = 'ACTIVE'`,
      user.userId,
    );

    const result: {
      studentId: string;
      studentName: string;
      assignments: unknown[];
    }[] = [];
    for (const child of children) {
      const rows = await this.tenantPrisma.query<
        AssignmentRow & { my_status: string | null; my_marks: string | null; my_feedback: string | null }
      >(
        `SELECT a.*, sub.name AS subject_name,
                s.status AS my_status, s.marks AS my_marks, s.feedback AS my_feedback
         FROM assignments a
         JOIN subjects sub ON sub.id = a.subject_id
         LEFT JOIN assignment_submissions s
           ON s.assignment_id = a.id AND s.student_id = $1::uuid
         WHERE a.deleted_at IS NULL AND a.status <> 'DRAFT'
           AND a.class_id = $2::uuid
           AND (a.section_id IS NULL OR a.section_id = $3::uuid)
         ORDER BY a.due_date DESC
         LIMIT 50`,
        child.id,
        child.class_id,
        child.section_id,
      );
      result.push({
        studentId: child.id,
        studentName: `${child.first_name} ${child.last_name}`,
        assignments: rows.map((r) => ({
          ...toAssignmentResponse(r),
          submission: r.my_status
            ? {
                status: r.my_status,
                marks: r.my_marks !== null ? Number(r.my_marks) : null,
                feedback: r.my_feedback,
              }
            : null,
        })),
      });
    }
    return result;
  }

  // ─── Teacher/admin: submissions view + review ───────────────────────────────

  /** Who submitted (with LATE flags) and — the teacher's real need — who is
   *  MISSING: enrolled ACTIVE students of the target minus submitters. */
  async listForAssignment(assignmentId: string) {
    const assignmentRows = await this.tenantPrisma.query<AssignmentRow>(
      `SELECT * FROM assignments WHERE id = $1::uuid AND deleted_at IS NULL`,
      assignmentId,
    );
    if (!assignmentRows[0]) throw new NotFoundException(`Assignment ${assignmentId} not found`);
    const a = assignmentRows[0];

    const submissions = await this.tenantPrisma.query<SubmissionRow>(
      `SELECT s.*, st.first_name, st.last_name, st.roll_number
       FROM assignment_submissions s
       JOIN students st ON st.id = s.student_id
       WHERE s.assignment_id = $1::uuid
       ORDER BY st.roll_number NULLS LAST, st.first_name`,
      assignmentId,
    );

    const missing = await this.tenantPrisma.query<{
      id: string;
      first_name: string;
      last_name: string;
      roll_number: number | null;
    }>(
      `SELECT st.id, st.first_name, st.last_name, st.roll_number
       FROM students st
       WHERE st.deleted_at IS NULL AND st.status = 'ACTIVE'
         AND st.class_id = $1::uuid
         AND ($2::uuid IS NULL OR st.section_id = $2::uuid)
         AND NOT EXISTS (
           SELECT 1 FROM assignment_submissions s
           WHERE s.assignment_id = $3::uuid AND s.student_id = st.id
         )
       ORDER BY st.roll_number NULLS LAST, st.first_name`,
      a.class_id,
      a.section_id,
      assignmentId,
    );

    return {
      submissions: submissions.map(toSubmissionResponse),
      missing: missing.map((m) => ({
        studentId: m.id,
        studentName: `${m.first_name} ${m.last_name}`,
        rollNumber: m.roll_number,
      })),
    };
  }

  /**
   * Marks/feedback + →REVIEWED. submission.reviewed fires on the transition
   * edge ONLY (publish-edge rule) — re-reviewing updates marks silently.
   */
  async review(
    assignmentId: string,
    submissionId: string,
    dto: ReviewSubmissionDto,
    user: AuthUser,
  ) {
    if (dto.marks === undefined && dto.feedback === undefined) {
      throw new BadRequestException('Provide marks, feedback, or both.');
    }

    const rows = await this.tenantPrisma.query<SubmissionRow & { prev_status: string }>(
      `UPDATE assignment_submissions s SET
         marks = COALESCE($3, s.marks),
         feedback = COALESCE($4, s.feedback),
         status = 'REVIEWED',
         reviewed_by = $5::uuid,
         reviewed_at = NOW(),
         updated_at = NOW()
       FROM (SELECT id, status AS prev_status FROM assignment_submissions
             WHERE id = $2::uuid AND assignment_id = $1::uuid) prev
       WHERE s.id = prev.id
       RETURNING s.*, prev.prev_status`,
      assignmentId,
      submissionId,
      dto.marks ?? null,
      dto.feedback ?? null,
      user.userId,
    );
    if (!rows[0]) throw new NotFoundException(`Submission ${submissionId} not found`);

    if (rows[0].prev_status !== 'REVIEWED') {
      const meta = await this.tenantPrisma.query<{ title: string }>(
        `SELECT title FROM assignments WHERE id = $1::uuid`,
        assignmentId,
      );
      const { slug } = this.tenantContext.getOrThrow();
      this.events.emit('submission.reviewed', {
        tenantSlug: slug,
        assignmentId,
        assignmentTitle: meta[0]?.title ?? 'Assignment',
        studentId: rows[0].student_id,
        marks: rows[0].marks !== null ? Number(rows[0].marks) : null,
      });
    }
    return toSubmissionResponse(rows[0]);
  }
}

/** Route-level role guards (assignment.controller.ts). */
export const ASSIGNMENT_MANAGER_ROLES = [
  Role.PLATFORM_ADMIN,
  Role.SCHOOL_OWNER,
  Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR,
  Role.TEACHER,
];
