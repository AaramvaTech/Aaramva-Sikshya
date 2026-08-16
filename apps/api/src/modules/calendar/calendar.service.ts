import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { toAdString } from '../attendance/entities/attendance.entity';
import {
  CalendarDayRow,
  CalendarDayResponseDto,
  toCalendarDayResponse,
} from './entities/calendar.entity';
import {
  CreateSchoolHolidayDto,
  UpdateSchoolHolidayDto,
  ListCalendarDaysQueryDto,
} from './dto/calendar-day.dto';

/**
 * CAL-1 Phase 2 — admin CRUD for source='SCHOOL' rows in
 * `school_calendar_days` (migration 0033). Locked decision: GOVT rows
 * (Phase 1's bulk import) are fixed and not overridable per-school —
 * update/remove reject any row whose source isn't 'SCHOOL', regardless of
 * caller role.
 *
 * Phase 3 adds the working-day query surface (isWorkingDay/countWorkingDays)
 * to this same service, in a later commit.
 */
@Injectable()
export class CalendarService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async createSchoolHoliday(
    dto: CreateSchoolHolidayDto,
    createdById: string,
  ): Promise<CalendarDayResponseDto> {
    const existing = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM school_calendar_days
       WHERE date = $1::date AND source = 'SCHOOL' AND deleted_at IS NULL`,
      dto.date,
    );
    if (existing[0]) {
      throw new ConflictException('A school holiday already exists for this date');
    }

    const rows = await this.tenantPrisma.query<CalendarDayRow>(
      `INSERT INTO school_calendar_days (date, is_holiday, source, label_en, label_ne, created_by)
       VALUES ($1::date, true, 'SCHOOL', $2, $3, $4::uuid)
       RETURNING *`,
      dto.date, dto.labelEn, dto.labelNe ?? null, createdById,
    );
    return toCalendarDayResponse(rows[0]);
  }

  async updateSchoolHoliday(id: string, dto: UpdateSchoolHolidayDto): Promise<CalendarDayResponseDto> {
    const existing = await this.findLiveOrThrow(id);
    this.assertSchoolSourced(existing, 'edited');

    if (dto.date !== undefined && dto.date !== toAdString(existing.date)) {
      const conflict = await this.tenantPrisma.query<{ id: string }>(
        `SELECT id FROM school_calendar_days
         WHERE date = $1::date AND source = 'SCHOOL' AND deleted_at IS NULL AND id != $2::uuid`,
        dto.date, id,
      );
      if (conflict[0]) {
        throw new ConflictException('A school holiday already exists for this date');
      }
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (dto.date !== undefined) { setClauses.push(`date = $${idx++}::date`); params.push(dto.date); }
    if (dto.labelEn !== undefined) { setClauses.push(`label_en = $${idx++}`); params.push(dto.labelEn); }
    if (dto.labelNe !== undefined) { setClauses.push(`label_ne = $${idx++}`); params.push(dto.labelNe); }
    if (setClauses.length === 0) return toCalendarDayResponse(existing);

    setClauses.push('updated_at = NOW()');
    params.push(id);

    const rows = await this.tenantPrisma.query<CalendarDayRow>(
      `UPDATE school_calendar_days SET ${setClauses.join(', ')}
       WHERE id = $${idx}::uuid AND source = 'SCHOOL' AND deleted_at IS NULL
       RETURNING *`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Calendar day ${id} not found`);
    return toCalendarDayResponse(rows[0]);
  }

  async removeSchoolHoliday(id: string): Promise<void> {
    const existing = await this.findLiveOrThrow(id);
    this.assertSchoolSourced(existing, 'removed');

    await this.tenantPrisma.execute(
      `UPDATE school_calendar_days SET deleted_at = NOW()
       WHERE id = $1::uuid AND source = 'SCHOOL' AND deleted_at IS NULL`,
      id,
    );
  }

  async list(query: ListCalendarDaysQueryDto): Promise<{
    data: CalendarDayResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const offset = (page - 1) * limit;

    const conditions = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;
    if (query.fromDate) { conditions.push(`date >= $${idx++}::date`); params.push(query.fromDate); }
    if (query.toDate) { conditions.push(`date <= $${idx++}::date`); params.push(query.toDate); }
    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<CalendarDayRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM school_calendar_days
       WHERE ${conditions.join(' AND ')}
       ORDER BY date ASC
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );
    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toCalendarDayResponse), meta: { page, limit, total } };
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private async findLiveOrThrow(id: string): Promise<CalendarDayRow> {
    const rows = await this.tenantPrisma.query<CalendarDayRow>(
      `SELECT * FROM school_calendar_days WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Calendar day ${id} not found`);
    return rows[0];
  }

  private assertSchoolSourced(row: CalendarDayRow, verb: 'edited' | 'removed'): void {
    if (row.source !== 'SCHOOL') {
      throw new ForbiddenException(`Government holidays cannot be ${verb}`);
    }
  }
}
