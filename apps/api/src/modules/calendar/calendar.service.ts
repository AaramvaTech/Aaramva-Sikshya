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
 * CAL-1. Two responsibilities in one service (matches the spec's own
 * naming): Phase 2's admin CRUD for source='SCHOOL' rows, and Phase 3's
 * working-day query surface other modules (late-fee, attendance) call.
 * Both read the same table, `school_calendar_days` (migration 0033).
 *
 * Locked decision: GOVT rows are fixed and not overridable per-school —
 * update/remove reject any row whose source isn't 'SCHOOL', regardless of
 * caller role.
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

  // ── Phase 3: working-day query surface ─────────────────────────────────
  // Consumed by BillFineService (late-fee, Phase 4) and StudentAttendanceService
  // / StudentMeService (attendance, Phase 5). Implicitly tenant-scoped via
  // TenantPrismaService, matching every other service in this codebase — no
  // explicit tenantId param (the spec's own example signature is shorthand
  // for "scoped per tenant", not a literal parameter list to copy).

  /** True iff there's a live holiday row (GOVT or SCHOOL) for this date.
   *  Does NOT consider the weekday — see isWorkingDay for the combined
   *  check. Split out because callers like the attendance-marking guard
   *  (Phase 5) want the holiday condition specifically, not the broader
   *  "is this a working day" question, which would also fold in Saturday —
   *  a pre-existing, separate platform concept CAL-1 isn't touching. */
  async isHoliday(date: string): Promise<boolean> {
    const rows = await this.tenantPrisma.query<{ ok: number }>(
      `SELECT 1 AS ok FROM school_calendar_days
       WHERE date = $1::date AND is_holiday = true AND deleted_at IS NULL
       LIMIT 1`,
      date,
    );
    return !!rows[0];
  }

  /** Working day = Sunday-Friday (the existing platform day-of-week
   *  convention: 0=Sunday..6=Saturday, see student-me.service.ts's
   *  todayInNepal) AND not a holiday. */
  async isWorkingDay(date: string): Promise<boolean> {
    if (dayOfWeek(date) === 6) return false;
    return !(await this.isHoliday(date));
  }

  /** Inclusive on both ends. Returns 0 if startDate > endDate. Fetches the
   *  holiday set for the whole range in one query rather than one query
   *  per day — an overdue-fee or attendance-summary window is at most a
   *  handful of months, so this stays a small in-memory set. */
  async countWorkingDays(startDate: string, endDate: string): Promise<number> {
    const holidayRows = await this.tenantPrisma.query<{ date: Date | string }>(
      `SELECT date FROM school_calendar_days
       WHERE date BETWEEN $1::date AND $2::date AND is_holiday = true AND deleted_at IS NULL`,
      startDate, endDate,
    );
    const holidays = new Set(holidayRows.map((r) => toAdString(r.date)));

    let count = 0;
    const cursor = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    while (cursor.getTime() <= end.getTime()) {
      const iso = cursor.toISOString().split('T')[0];
      if (cursor.getUTCDay() !== 6 && !holidays.has(iso)) count++;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return count;
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

function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}
