import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import {
  LeaveTypeRow,
  StaffLeaveRequestRow,
  toLeaveTypeResponse,
  toLeaveRequestResponse,
  LeaveTypeResponseDto,
  LeaveRequestResponseDto,
  LeaveBalanceDto,
} from './entities/hr.entity';
import { CreateLeaveTypeDto, UpdateLeaveTypeDto, ApplyLeaveDto, ReviewLeaveDto, LeaveQueryDto } from './dto/leave.dto';

@Injectable()
export class LeaveService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  // ─── Leave Types ────────────────────────────────────────────────────────────

  async createLeaveType(dto: CreateLeaveTypeDto): Promise<LeaveTypeResponseDto> {
    const rows = await this.tenantPrisma.query<LeaveTypeRow>(
      `INSERT INTO leave_types (name, days_per_year, is_paid)
         VALUES ($1, $2, $3)
         RETURNING *`,
      dto.name,
      dto.daysPerYear,
      dto.isPaid ?? true,
    );
    return toLeaveTypeResponse(rows[0]);
  }

  async listLeaveTypes(): Promise<LeaveTypeResponseDto[]> {
    const rows = await this.tenantPrisma.query<LeaveTypeRow>(
      `SELECT * FROM leave_types WHERE deleted_at IS NULL ORDER BY name ASC`,
    );
    return rows.map(toLeaveTypeResponse);
  }

  async updateLeaveType(id: string, dto: UpdateLeaveTypeDto): Promise<LeaveTypeResponseDto> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (dto.name !== undefined) { updates.push(`name = $${idx++}`); values.push(dto.name); }
    if (dto.daysPerYear !== undefined) { updates.push(`days_per_year = $${idx++}`); values.push(dto.daysPerYear); }
    if (dto.isPaid !== undefined) { updates.push(`is_paid = $${idx++}`); values.push(dto.isPaid); }
    if (updates.length === 0) {
      const rows = await this.tenantPrisma.query<LeaveTypeRow>(`SELECT * FROM leave_types WHERE id = $1 AND deleted_at IS NULL`, id);
      return toLeaveTypeResponse(rows[0]);
    }
    values.push(id);
    const rows = await this.tenantPrisma.query<LeaveTypeRow>(
      `UPDATE leave_types SET ${updates.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL RETURNING *`,
      ...values,
    );
    return toLeaveTypeResponse(rows[0]);
  }

  async deleteLeaveType(id: string): Promise<void> {
    await this.tenantPrisma.execute(
      `UPDATE leave_types SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      id,
    );
  }

  // ─── Leave Requests ─────────────────────────────────────────────────────────

  async applyLeave(dto: ApplyLeaveDto, userId: string): Promise<LeaveRequestResponseDto> {
    // Overlap check
    const [overlap] = await this.tenantPrisma.query<{ count: string }>(
      `SELECT COUNT(*) AS count
         FROM staff_leave_requests
        WHERE user_id = $1::uuid
          AND status IN ('PENDING', 'APPROVED')
          AND deleted_at IS NULL
          AND from_date <= $2::date
          AND to_date >= $3::date`,
      userId,
      dto.toDate,
      dto.fromDate,
    );
    if (parseInt(overlap.count, 10) > 0) {
      throw new ConflictException('Leave request overlaps with existing request');
    }

    const from = new Date(dto.fromDate);
    const to = new Date(dto.toDate);
    const totalDays = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const rows = await this.tenantPrisma.query<StaffLeaveRequestRow>(
      `INSERT INTO staff_leave_requests
           (user_id, leave_type_id, from_date, to_date, total_days, reason)
         VALUES ($1::uuid, $2::uuid, $3::date, $4::date, $5, $6)
         RETURNING *, NULL AS leave_type_name`,
      userId,
      dto.leaveTypeId,
      dto.fromDate,
      dto.toDate,
      totalDays,
      dto.reason ?? null,
    );
    return toLeaveRequestResponse(rows[0]);
  }

  async listLeaveRequests(query: LeaveQueryDto): Promise<{
    data: LeaveRequestResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['lr.deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (query.userId) { conditions.push(`lr.user_id = $${idx++}::uuid`); params.push(query.userId); }
    if (query.status) { conditions.push(`lr.status = $${idx++}`); params.push(query.status); }
    if (query.fromDate) { conditions.push(`lr.from_date >= $${idx++}::date`); params.push(query.fromDate); }
    if (query.toDate) { conditions.push(`lr.to_date <= $${idx++}::date`); params.push(query.toDate); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<StaffLeaveRequestRow & { total_count: string }>(
      `SELECT lr.*, lt.name AS leave_type_name,
              u.first_name || ' ' || u.last_name AS staff_name,
              COUNT(*) OVER() AS total_count
         FROM staff_leave_requests lr
         JOIN leave_types lt ON lt.id = lr.leave_type_id
         JOIN users u ON u.id = lr.user_id
         ${where}
         ORDER BY lr.applied_at DESC
         LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toLeaveRequestResponse), meta: { page, limit, total } };
  }

  async getMyLeaveRequests(userId: string, query: LeaveQueryDto): Promise<{
    data: LeaveRequestResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    return this.listLeaveRequests({ ...query, userId });
  }

  async reviewLeave(
    id: string,
    dto: ReviewLeaveDto,
    reviewerId: string,
  ): Promise<LeaveRequestResponseDto> {
    const rows = await this.tenantPrisma.query<StaffLeaveRequestRow>(
      `SELECT * FROM staff_leave_requests WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Leave request ${id} not found`);
    if (rows[0].status !== 'PENDING') {
      throw new BadRequestException(`Leave request is already ${rows[0].status}`);
    }

    const updated = await this.tenantPrisma.query<StaffLeaveRequestRow>(
      `UPDATE staff_leave_requests
          SET status = $1, reviewed_by = $2::uuid, reviewed_at = NOW(),
              reviewer_note = $3, updated_at = NOW()
        WHERE id = $4::uuid
        RETURNING *, NULL AS leave_type_name`,
      dto.status,
      reviewerId,
      dto.reviewerNote ?? null,
      id,
    );
    return toLeaveRequestResponse(updated[0]);
  }

  async cancelLeave(id: string, userId: string): Promise<void> {
    const rows = await this.tenantPrisma.query<StaffLeaveRequestRow>(
      `SELECT * FROM staff_leave_requests WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Leave request ${id} not found`);

    if (rows[0].user_id !== userId) {
      throw new ForbiddenException('You can only cancel your own leave requests');
    }
    if (rows[0].status !== 'PENDING') {
      throw new BadRequestException(`Cannot cancel a ${rows[0].status} leave request`);
    }

    await this.tenantPrisma.execute(
      `UPDATE staff_leave_requests
          SET status = 'CANCELLED', updated_at = NOW()
        WHERE id = $1::uuid`,
      id,
    );
  }

  async getLeaveBalance(userId: string): Promise<LeaveBalanceDto[]> {
    // Nepali fiscal year: 1 Shrawan ≈ July 16 in AD
    const now = new Date();
    const fiscalYearStart = now.getMonth() >= 6
      ? new Date(now.getFullYear(), 6, 16)   // July 16 of current year
      : new Date(now.getFullYear() - 1, 6, 16); // July 16 of previous year
    const fiscalYearEnd = new Date(fiscalYearStart.getFullYear() + 1, 6, 15);

    const leaveTypes = await this.tenantPrisma.query<LeaveTypeRow>(
      `SELECT * FROM leave_types WHERE deleted_at IS NULL ORDER BY name ASC`,
    );

    const balances: LeaveBalanceDto[] = [];

    for (const lt of leaveTypes) {
      const [usedRow] = await this.tenantPrisma.query<{ used_days: string }>(
        `SELECT COALESCE(SUM(total_days), 0) AS used_days
           FROM staff_leave_requests
          WHERE user_id = $1::uuid
            AND leave_type_id = $2::uuid
            AND status = 'APPROVED'
            AND deleted_at IS NULL
            AND from_date >= $3::date
            AND to_date <= $4::date`,
        userId,
        lt.id,
        fiscalYearStart.toISOString().split('T')[0],
        fiscalYearEnd.toISOString().split('T')[0],
      );
      const usedDays = parseInt(usedRow?.used_days ?? '0', 10);
      balances.push({
        leaveTypeId: lt.id,
        leaveTypeName: lt.name,
        entitlement: lt.days_per_year,
        used: usedDays,
        balance: lt.days_per_year - usedDays,
      });
    }

    return balances;
  }
}
