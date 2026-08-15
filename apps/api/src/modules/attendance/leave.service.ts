import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { errorBody } from '../common/errors/error-codes';
import { Role } from '../common/enums/role.enum';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { SmsService } from '../communication/sms.service';
import { GuardianScopeService } from '../student/guardian-scope.service';
import {
  LeaveApplicationRow,
  LeaveApplicationResponseDto,
  toLeaveApplicationResponse,
  toBsString,
} from './entities/attendance.entity';
import { ApplyLeaveDto, GetLeaveQueryDto, ReviewLeaveDto } from './dto/leave.dto';

@Injectable()
export class LeaveService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly sms: SmsService,
    private readonly guardianScope: GuardianScopeService,
  ) {}

  async applyLeave(
    dto: ApplyLeaveDto,
    appliedById: string,
    callerRole: Role,
  ): Promise<LeaveApplicationResponseDto> {
    let studentId: string;

    if (callerRole === Role.STUDENT) {
      const linked = await this.tenantPrisma.query<{ id: string }>(
        `SELECT id FROM students WHERE user_id = $1::uuid AND deleted_at IS NULL`,
        appliedById,
      );
      if (!linked[0]) {
        throw new ForbiddenException(errorBody('FORBIDDEN_SCOPE'));
      }
      studentId = linked[0].id;
    } else if (callerRole === Role.PARENT) {
      // PARENT: dto.studentId is required; verify the student is one of the caller's children
      if (!dto.studentId) throw new BadRequestException('studentId is required');
      await this.guardianScope.assertOwnsStudent(appliedById, dto.studentId);
      studentId = dto.studentId;
    } else {
      // Staff roles: studentId is required in the body
      if (!dto.studentId) throw new BadRequestException('studentId is required');
      studentId = dto.studentId;
    }

    const rows = await this.tenantPrisma.query<LeaveApplicationRow>(
      `INSERT INTO leave_applications
         (student_id, academic_year_id, from_date, to_date, reason, applied_by)
       VALUES ($1::uuid, $2::uuid, $3::date, $4::date, $5, $6::uuid)
       RETURNING *`,
      studentId,
      dto.academicYearId,
      dto.fromDate,
      dto.toDate,
      dto.reason,
      appliedById,
    );
    return toLeaveApplicationResponse(rows[0]);
  }

  async getByQuery(query: GetLeaveQueryDto): Promise<{
    data: LeaveApplicationResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = ['la.deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (query.studentId) { conditions.push(`la.student_id = $${idx++}::uuid`); params.push(query.studentId); }
    if (query.academicYearId) { conditions.push(`la.academic_year_id = $${idx++}::uuid`); params.push(query.academicYearId); }
    if (query.status) { conditions.push(`la.status = $${idx++}`); params.push(query.status); }

    params.push(limit, offset);

    // Enrich with applicant + child + class/section names so the review screen
    // can render without N+1 lookups. COALESCE falls back to legacy text columns
    // (class_name/section_name) for pre-relational student rows.
    const rows = await this.tenantPrisma.query<LeaveApplicationRow & { total_count: string }>(
      `SELECT la.*,
              (s.first_name || ' ' || s.last_name) AS student_name,
              s.student_id                          AS admission_number,
              COALESCE(c.name, s.class_name)        AS class_name,
              COALESCE(sec.name, s.section_name)    AS section_name,
              NULLIF(TRIM(COALESCE(ab.first_name, '') || ' ' || COALESCE(ab.last_name, '')), '') AS applied_by_name,
              NULLIF(TRIM(COALESCE(rb.first_name, '') || ' ' || COALESCE(rb.last_name, '')), '') AS reviewed_by_name,
              COUNT(*) OVER() AS total_count
       FROM leave_applications la
       JOIN students s   ON s.id = la.student_id
       LEFT JOIN sections sec ON sec.id = s.section_id
       LEFT JOIN classes c    ON c.id = s.class_id
       LEFT JOIN users ab     ON ab.id = la.applied_by
       LEFT JOIN users rb     ON rb.id = la.reviewed_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY la.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return {
      data: rows.map(toLeaveApplicationResponse),
      meta: { page, limit, total },
    };
  }

  async reviewLeave(
    id: string,
    dto: ReviewLeaveDto,
    reviewerId: string,
  ): Promise<LeaveApplicationResponseDto> {
    // One transaction: guard the PENDING→decided transition, stamp the decider +
    // note, and (on approve) reflect the covered range into attendance as LEAVE.
    // The status guard makes the whole thing fire-once — a leave can only leave
    // PENDING a single time, so the notify-back below is sent exactly once.
    const updated = await this.tenantPrisma.run(async (tx) => {
      const existing = await tx.$queryRawUnsafe<(LeaveApplicationRow & { student_section_id: string | null })[]>(
        `SELECT la.*, s.section_id AS student_section_id
         FROM leave_applications la
         JOIN students s ON s.id = la.student_id
         WHERE la.id = $1::uuid AND la.deleted_at IS NULL`,
        id,
      );
      if (!existing[0]) throw new NotFoundException(`Leave application ${id} not found`);
      if (existing[0].status !== 'PENDING') {
        throw new BadRequestException('Leave application has already been reviewed');
      }

      const rows = await tx.$queryRawUnsafe<LeaveApplicationRow[]>(
        `UPDATE leave_applications
         SET status = $1, reviewed_by = $2::uuid, reviewed_at = NOW(),
             review_remarks = $3, updated_at = NOW()
         WHERE id = $4::uuid
         RETURNING *`,
        dto.status,
        reviewerId,
        dto.remarks ?? null,
        id,
      );
      const row = rows[0];

      if (dto.status === 'APPROVED') {
        const sectionId = existing[0].student_section_id;
        // A LEAVE attendance row needs a section. Legacy students with no
        // section_id can't be reflected; the approval still stands (the leave
        // record is the source of truth) — we just skip the attendance write.
        if (sectionId) {
          await tx.$executeRawUnsafe(
            `INSERT INTO student_attendance
               (student_id, section_id, academic_year_id, date, status, marked_by)
             SELECT $1::uuid, $2::uuid, $3::uuid, d::date, 'LEAVE', $4::uuid
             FROM generate_series($5::date, $6::date, interval '1 day') AS d
             ON CONFLICT (student_id, date, academic_year_id)
             DO UPDATE SET status = 'LEAVE', marked_by = EXCLUDED.marked_by, updated_at = NOW()
             WHERE student_attendance.status NOT IN ('PRESENT', 'LATE')`,
            row.student_id,
            sectionId,
            row.academic_year_id,
            reviewerId,
            existing[0].from_date,
            existing[0].to_date,
          );
        }
      }

      return row;
    });

    // Notify the applicant of the decision (best-effort, after commit, once).
    await this.notifyApplicant(updated);

    return toLeaveApplicationResponse(updated);
  }

  /**
   * SMS the applicant the approve/reject outcome via Sparrow. Best-effort: a
   * missing phone or a provider failure must never roll back a recorded
   * decision (failures are persisted in sms_logs by SmsService).
   */
  private async notifyApplicant(row: LeaveApplicationRow): Promise<void> {
    const info = await this.tenantPrisma.query<{ phone: string | null; student_name: string }>(
      `SELECT u.phone AS phone,
              (s.first_name || ' ' || s.last_name) AS student_name
       FROM leave_applications la
       JOIN users u    ON u.id = la.applied_by
       JOIN students s ON s.id = la.student_id
       WHERE la.id = $1::uuid`,
      row.id,
    );
    const phone = info[0]?.phone;
    if (!phone) return;

    const verb = row.status === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    const from = toBsString(row.from_date);
    const to = toBsString(row.to_date);
    const message = `Leave request for ${info[0].student_name} (${from} to ${to} BS) has been ${verb}.`;

    try {
      await this.sms.send(phone, message, 'LEAVE_DECISION', row.student_id);
    } catch {
      // swallow — decision already committed; SMS state lives in sms_logs
    }
  }
}
