import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '../common/enums/role.enum';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  LeaveApplicationRow,
  LeaveApplicationResponseDto,
  toLeaveApplicationResponse,
} from './entities/attendance.entity';
import { ApplyLeaveDto, GetLeaveQueryDto, ReviewLeaveDto } from './dto/leave.dto';

@Injectable()
export class LeaveService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

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
        throw new ForbiddenException('No student record is linked to this account');
      }
      studentId = linked[0].id;
    } else if (callerRole === Role.PARENT) {
      // PARENT: dto.studentId is required; verify the student is one of the caller's children
      if (!dto.studentId) throw new BadRequestException('studentId is required');
      const children = await this.tenantPrisma.query<{ student_id: string }>(
        `SELECT student_id FROM guardians WHERE user_id = $1::uuid`,
        appliedById,
      );
      const childIds = new Set(children.map((c) => c.student_id));
      if (!childIds.has(dto.studentId)) {
        throw new ForbiddenException('You can only file leave for your own children');
      }
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

    const conditions: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (query.studentId) { conditions.push(`student_id = $${idx++}::uuid`); params.push(query.studentId); }
    if (query.academicYearId) { conditions.push(`academic_year_id = $${idx++}::uuid`); params.push(query.academicYearId); }
    if (query.status) { conditions.push(`status = $${idx++}`); params.push(query.status); }

    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<LeaveApplicationRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM leave_applications
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
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
    const existing = await this.tenantPrisma.query<LeaveApplicationRow>(
      `SELECT * FROM leave_applications WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!existing[0]) throw new NotFoundException(`Leave application ${id} not found`);
    if (existing[0].status !== 'PENDING') {
      throw new BadRequestException('Leave application has already been reviewed');
    }

    const rows = await this.tenantPrisma.query<LeaveApplicationRow>(
      `UPDATE leave_applications
       SET status = $1, reviewed_by = $2::uuid, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $3::uuid
       RETURNING *`,
      dto.status,
      reviewerId,
      id,
    );
    return toLeaveApplicationResponse(rows[0]);
  }
}
