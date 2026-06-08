import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  StaffAttendanceRow,
  StaffSummaryDto,
  toStaffAttendanceResponse,
} from './entities/attendance.entity';
import {
  BulkStaffAttendanceDto,
  GetStaffAttendanceQueryDto,
} from './dto/staff-attendance.dto';

@Injectable()
export class StaffAttendanceService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async bulkMark(dto: BulkStaffAttendanceDto, markedById: string): Promise<void> {
    await this.tenantPrisma.run(async (tx) => {
      for (const record of dto.records) {
        await tx.$executeRawUnsafe(
          `INSERT INTO staff_attendance
             (user_id, date, status, check_in, check_out, remarks, marked_by)
           VALUES ($1::uuid, $2::date, $3, $4::time, $5::time, $6, $7::uuid)
           ON CONFLICT (user_id, date)
           DO UPDATE SET
             status     = EXCLUDED.status,
             check_in   = EXCLUDED.check_in,
             check_out  = EXCLUDED.check_out,
             remarks    = EXCLUDED.remarks,
             marked_by  = EXCLUDED.marked_by,
             updated_at = NOW()`,
          record.userId,
          dto.date,
          record.status,
          record.checkIn ?? null,
          record.checkOut ?? null,
          record.remarks ?? null,
          markedById,
        );
      }
    });
  }

  async getByQuery(query: GetStaffAttendanceQueryDto): Promise<{
    data: ReturnType<typeof toStaffAttendanceResponse>[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (query.userId) { conditions.push(`user_id = $${idx++}::uuid`); params.push(query.userId); }
    if (query.status) { conditions.push(`status = $${idx++}`); params.push(query.status); }
    if (query.date) { conditions.push(`date = $${idx++}::date`); params.push(query.date); }
    if (query.fromDate) { conditions.push(`date >= $${idx++}::date`); params.push(query.fromDate); }
    if (query.toDate) { conditions.push(`date <= $${idx++}::date`); params.push(query.toDate); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<StaffAttendanceRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM staff_attendance
       ${where}
       ORDER BY date DESC, user_id
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return {
      data: rows.map(toStaffAttendanceResponse),
      meta: { page, limit, total },
    };
  }

  async getStaffSummary(userId: string, year: number, month: number): Promise<StaffSummaryDto> {
    const counts = await this.tenantPrisma.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) AS count
       FROM staff_attendance
       WHERE user_id = $1::uuid
         AND EXTRACT(YEAR FROM date) = $2
         AND EXTRACT(MONTH FROM date) = $3
       GROUP BY status`,
      userId,
      year,
      month,
    );

    const countMap: Record<string, number> = {};
    for (const c of counts) countMap[c.status] = parseInt(c.count, 10);

    const present = countMap['PRESENT'] ?? 0;
    const absent = countMap['ABSENT'] ?? 0;
    const late = countMap['LATE'] ?? 0;
    const leave = countMap['LEAVE'] ?? 0;
    const holiday = countMap['HOLIDAY'] ?? 0;
    const total = present + absent + late + leave + holiday;

    return { userId, month, year, present, absent, late, leave, holiday, total };
  }
}
