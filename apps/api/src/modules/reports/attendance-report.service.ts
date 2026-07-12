import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { bsMonthBucket, isoDate, pct, resolveRange } from './report.util';

interface DayRow {
  date: Date;
  present: string;
  absent: string;
  late: string;
  leave: string;
}

export interface TrendBucket {
  bucket: string;
  label: string;
  present: number;
  absent: number;
  late: number;
  leave: number;
  total: number;
  attendanceRate: number; // (present+late)/total — the platform formula
}

function foldRows(rows: DayRow[], groupBy: 'day' | 'bs-month'): TrendBucket[] {
  const buckets = new Map<string, TrendBucket>();
  for (const r of rows) {
    const day = isoDate(r.date);
    const { key, label } =
      groupBy === 'day' ? { key: day, label: day } : bsMonthBucket(day);
    let b = buckets.get(key);
    if (!b) {
      b = { bucket: key, label, present: 0, absent: 0, late: 0, leave: 0, total: 0, attendanceRate: 0 };
      buckets.set(key, b);
    }
    b.present += parseInt(r.present, 10);
    b.absent += parseInt(r.absent, 10);
    b.late += parseInt(r.late, 10);
    b.leave += parseInt(r.leave, 10);
  }
  const out = [...buckets.values()].sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
  for (const b of out) {
    b.total = b.present + b.absent + b.late + b.leave;
    b.attendanceRate = pct(b.present + b.late, b.total);
  }
  return out;
}

/** Aggregation SQL: one row per day (index-aligned on (section_id, date) /
 *  the student index; day-buckets are folded into BS months in the service —
 *  the Step-0-verified approach, no SQL-side BS math. */
const TREND_SQL = `
  SELECT a.date,
         COUNT(*) FILTER (WHERE a.status = 'PRESENT') AS present,
         COUNT(*) FILTER (WHERE a.status = 'ABSENT')  AS absent,
         COUNT(*) FILTER (WHERE a.status = 'LATE')    AS late,
         COUNT(*) FILTER (WHERE a.status = 'LEAVE')   AS leave
  FROM student_attendance a
  JOIN sections sec ON sec.id = a.section_id
  WHERE a.date >= $1::date AND a.date <= $2::date
    AND ($3::uuid IS NULL OR sec.class_id = $3::uuid)
    AND ($4::uuid IS NULL OR a.section_id = $4::uuid)
  GROUP BY a.date
  ORDER BY a.date`;

@Injectable()
export class AttendanceReportService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getTrends(params: {
    from?: string;
    to?: string;
    classId?: string;
    sectionId?: string;
    groupBy?: string;
  }) {
    const { from, to } = resolveRange(params.from, params.to);
    const groupBy = params.groupBy === 'day' ? 'day' : 'bs-month';

    const rows = await this.tenantPrisma.query<DayRow>(
      TREND_SQL,
      from,
      to,
      params.classId ?? null,
      params.sectionId ?? null,
    );
    return { from, to, groupBy, buckets: foldRows(rows, groupBy) };
  }

  /** All sections of one class side by side (same range, one row per section). */
  async getClassComparison(params: { classId: string; from?: string; to?: string }) {
    const { from, to } = resolveRange(params.from, params.to);
    const rows = await this.tenantPrisma.query<{
      section_id: string;
      section_name: string;
      present: string;
      absent: string;
      late: string;
      leave: string;
    }>(
      `SELECT sec.id AS section_id, sec.name AS section_name,
              COUNT(a.*) FILTER (WHERE a.status = 'PRESENT') AS present,
              COUNT(a.*) FILTER (WHERE a.status = 'ABSENT')  AS absent,
              COUNT(a.*) FILTER (WHERE a.status = 'LATE')    AS late,
              COUNT(a.*) FILTER (WHERE a.status = 'LEAVE')   AS leave
       FROM sections sec
       LEFT JOIN student_attendance a
         ON a.section_id = sec.id AND a.date >= $2::date AND a.date <= $3::date
       WHERE sec.class_id = $1::uuid AND sec.deleted_at IS NULL
       GROUP BY sec.id, sec.name
       ORDER BY sec.name`,
      params.classId,
      from,
      to,
    );
    return {
      from,
      to,
      sections: rows.map((r) => {
        const present = parseInt(r.present, 10);
        const absent = parseInt(r.absent, 10);
        const late = parseInt(r.late, 10);
        const leave = parseInt(r.leave, 10);
        const total = present + absent + late + leave;
        return {
          sectionId: r.section_id,
          sectionName: r.section_name,
          present,
          absent,
          late,
          leave,
          total,
          attendanceRate: pct(present + late, total),
        };
      }),
    };
  }

  /** The actionable list: students whose rate in the range is below threshold. */
  async getLowAttendance(params: {
    from?: string;
    to?: string;
    classId?: string;
    sectionId?: string;
    threshold?: number;
  }) {
    const { from, to } = resolveRange(params.from, params.to);
    const threshold = params.threshold ?? 75;

    const rows = await this.tenantPrisma.query<{
      student_id: string;
      first_name: string;
      last_name: string;
      roll_number: number | null;
      class_name: string | null;
      section_name: string | null;
      present: string;
      late: string;
      total: string;
    }>(
      `SELECT s.id AS student_id, s.first_name, s.last_name, s.roll_number,
              s.class_name, s.section_name,
              COUNT(*) FILTER (WHERE a.status = 'PRESENT') AS present,
              COUNT(*) FILTER (WHERE a.status = 'LATE')    AS late,
              COUNT(*)                                     AS total
       FROM student_attendance a
       JOIN students s ON s.id = a.student_id AND s.deleted_at IS NULL
       JOIN sections sec ON sec.id = a.section_id
       WHERE a.date >= $1::date AND a.date <= $2::date
         AND ($3::uuid IS NULL OR sec.class_id = $3::uuid)
         AND ($4::uuid IS NULL OR a.section_id = $4::uuid)
       GROUP BY s.id, s.first_name, s.last_name, s.roll_number, s.class_name, s.section_name
       ORDER BY s.class_name, s.section_name, s.roll_number NULLS LAST`,
      from,
      to,
      params.classId ?? null,
      params.sectionId ?? null,
    );

    const students = rows
      .map((r) => {
        const total = parseInt(r.total, 10);
        const rate = pct(parseInt(r.present, 10) + parseInt(r.late, 10), total);
        return {
          studentId: r.student_id,
          studentName: `${r.first_name} ${r.last_name}`,
          rollNumber: r.roll_number,
          className: r.class_name,
          sectionName: r.section_name,
          markedDays: total,
          attendanceRate: rate,
        };
      })
      .filter((s) => s.attendanceRate < threshold)
      .sort((a, b) => a.attendanceRate - b.attendanceRate);

    return { from, to, threshold, students };
  }

  /** Per-staff attendance summary over the range. */
  async getStaffSummary(params: { from?: string; to?: string }) {
    const { from, to } = resolveRange(params.from, params.to);
    const rows = await this.tenantPrisma.query<{
      user_id: string;
      first_name: string;
      last_name: string;
      present: string;
      absent: string;
      late: string;
      leave: string;
    }>(
      `SELECT u.id AS user_id, u.first_name, u.last_name,
              COUNT(*) FILTER (WHERE a.status = 'PRESENT') AS present,
              COUNT(*) FILTER (WHERE a.status = 'ABSENT')  AS absent,
              COUNT(*) FILTER (WHERE a.status = 'LATE')    AS late,
              COUNT(*) FILTER (WHERE a.status = 'LEAVE')   AS leave
       FROM staff_attendance a
       JOIN users u ON u.id = a.user_id AND u.deleted_at IS NULL
       WHERE a.date >= $1::date AND a.date <= $2::date
       GROUP BY u.id, u.first_name, u.last_name
       ORDER BY u.first_name, u.last_name`,
      from,
      to,
    );
    return {
      from,
      to,
      staff: rows.map((r) => {
        const present = parseInt(r.present, 10);
        const absent = parseInt(r.absent, 10);
        const late = parseInt(r.late, 10);
        const leave = parseInt(r.leave, 10);
        const total = present + absent + late + leave;
        return {
          userId: r.user_id,
          staffName: `${r.first_name} ${r.last_name}`,
          present,
          absent,
          late,
          leave,
          markedDays: total,
          attendanceRate: pct(present + late, total),
        };
      }),
    };
  }
}
