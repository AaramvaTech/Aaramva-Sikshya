import { ForbiddenException, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { StudentMeAttendanceSummaryDto, StudentMeAttendanceHistoryDto } from './dto/student-me-query.dto';

// ─── Nepal timezone helpers ────────────────────────────────────────────────────

/** Nepal is UTC+05:45 = 345 minutes ahead of UTC. */
const NEPAL_OFFSET_MS = 345 * 60 * 1000;

/**
 * Returns today's date and day-of-week in Nepal local time.
 * Uses Date.now() so tests can mock it via jest.spyOn(Date, 'now').
 */
export function todayInNepal(): { dateAd: string; dayOfWeek: number } {
  const nowNepal = new Date(Date.now() + NEPAL_OFFSET_MS);
  const dateAd = nowNepal.toISOString().split('T')[0];
  const dayOfWeek = nowNepal.getUTCDay(); // 0=Sunday, 6=Saturday
  return { dateAd, dayOfWeek };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

const toAdString = (d: Date | string): string =>
  (d instanceof Date ? d : new Date(d)).toISOString().split('T')[0];

// ─── Internal row types ───────────────────────────────────────────────────────

interface StudentBaseRow {
  id: string;
  student_id: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  section_id: string | null;
  roll_number: number | null;
}

interface EnrollmentRow {
  class_name: string;
  section_name: string;
  academic_year_id: string;
  academic_year_name: string;
}

interface AcademicYearRow {
  id: string;
  name: string;
  start_date: Date | string;
  end_date: Date | string;
}

interface TimetableSlotRow {
  slot_id: string;
  period_number: number;
  start_time: string;
  end_time: string;
  subject_id: string;
  subject_name: string;
  subject_code: string | null;
  teacher_id: string;
  teacher_full_name: string;
  room: string | null;
}

interface AttendanceCountRow {
  status: string;
  count: string;
}

interface WorkingDaysRow {
  working_days: string;
}

interface AttendanceHistoryRow {
  date: Date | string;
  status: string;
  remarks: string | null;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class StudentMeService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * Resolves the student record linked to a given userId.
   * Throws ForbiddenException if no student is linked.
   */
  private async resolveStudent(userId: string): Promise<StudentBaseRow> {
    const rows = await this.tenantPrisma.query<StudentBaseRow>(
      `SELECT id, student_id, first_name, last_name, photo_url, section_id, roll_number
       FROM students
       WHERE user_id = $1::uuid AND deleted_at IS NULL`,
      userId,
    );
    if (!rows[0]) {
      throw new ForbiddenException('No student record linked to this account');
    }
    return rows[0];
  }

  /** GET /students/me — own profile + current enrollment */
  async getMyProfile(userId: string) {
    const student = await this.resolveStudent(userId);

    let currentEnrollment: {
      className: string;
      sectionName: string;
      rollNumber: number | null;
      academicYearId: string;
      academicYearName: string;
    } | null = null;

    if (student.section_id) {
      const rows = await this.tenantPrisma.query<EnrollmentRow>(
        `SELECT
           c.name    AS class_name,
           sec.name  AS section_name,
           ay.id     AS academic_year_id,
           ay.name   AS academic_year_name
         FROM sections sec
         JOIN classes        c   ON sec.class_id = c.id
         JOIN academic_years ay  ON ay.is_current = true AND ay.deleted_at IS NULL
         WHERE sec.id = $1::uuid AND sec.deleted_at IS NULL`,
        student.section_id,
      );

      if (rows[0]) {
        currentEnrollment = {
          className: rows[0].class_name,
          sectionName: rows[0].section_name,
          rollNumber: student.roll_number,
          academicYearId: rows[0].academic_year_id,
          academicYearName: rows[0].academic_year_name,
        };
      }
    }

    return {
      id: student.id,
      admissionNumber: student.student_id,
      firstName: student.first_name,
      lastName: student.last_name,
      photoUrl: student.photo_url,
      currentEnrollment,
    };
  }

  /** GET /students/me/timetable/today — today's periods for the student's section */
  async getMyTodayTimetable(userId: string) {
    const { dateAd, dayOfWeek } = todayInNepal();

    // Saturday is a weekend in Nepal (Sunday is a school day)
    if (dayOfWeek === 6) {
      return { dayOfWeek, dateAd, isSchoolDay: false, periods: [] };
    }

    const student = await this.resolveStudent(userId);

    if (!student.section_id) {
      return { dayOfWeek, dateAd, isSchoolDay: false, periods: [] };
    }

    const slots = await this.tenantPrisma.query<TimetableSlotRow>(
      `SELECT
         ts.id                                          AS slot_id,
         ts.period_number,
         ts.start_time,
         ts.end_time,
         ts.room,
         sub.id                                         AS subject_id,
         sub.name                                       AS subject_name,
         sub.code                                       AS subject_code,
         u.id                                           AS teacher_id,
         u.first_name || ' ' || u.last_name            AS teacher_full_name
       FROM timetable_slots ts
       JOIN subjects sub ON ts.subject_id = sub.id
       JOIN users    u   ON ts.teacher_id = u.id
       WHERE ts.section_id  = $1::uuid
         AND ts.day_of_week = $2
         AND ts.deleted_at  IS NULL
       ORDER BY ts.period_number`,
      student.section_id,
      dayOfWeek,
    );

    const periods = slots.map((s) => ({
      slotId: s.slot_id,
      periodNumber: Number(s.period_number),
      startTime: typeof s.start_time === 'string' ? s.start_time.substring(0, 5) : String(s.start_time),
      endTime: typeof s.end_time === 'string' ? s.end_time.substring(0, 5) : String(s.end_time),
      subject: { id: s.subject_id, name: s.subject_name, code: s.subject_code },
      teacher: { id: s.teacher_id, fullName: s.teacher_full_name },
      room: s.room,
    }));

    return { dayOfWeek, dateAd, isSchoolDay: true, periods };
  }

  /** GET /students/me/attendance/summary?academicYearId= */
  async getMyAttendanceSummary(userId: string, dto: StudentMeAttendanceSummaryDto) {
    const student = await this.resolveStudent(userId);

    // Resolve academic year
    let academicYearId: string;
    let academicYearName: string;

    if (dto.academicYearId) {
      const yearRows = await this.tenantPrisma.query<AcademicYearRow>(
        `SELECT id, name FROM academic_years WHERE id = $1::uuid AND deleted_at IS NULL`,
        dto.academicYearId,
      );
      if (!yearRows[0]) {
        return {
          academicYearId: dto.academicYearId,
          academicYearName: '',
          totalWorkingDays: 0,
          present: 0,
          absent: 0,
          late: 0,
          leave: 0,
          attendancePercent: 0,
          recentHistory: [],
        };
      }
      academicYearId = yearRows[0].id;
      academicYearName = yearRows[0].name;
    } else {
      const yearRows = await this.tenantPrisma.query<AcademicYearRow>(
        `SELECT id, name FROM academic_years WHERE is_current = true AND deleted_at IS NULL LIMIT 1`,
      );
      if (!yearRows[0]) {
        return {
          academicYearId: '',
          academicYearName: '',
          totalWorkingDays: 0,
          present: 0,
          absent: 0,
          late: 0,
          leave: 0,
          attendancePercent: 0,
          recentHistory: [],
        };
      }
      academicYearId = yearRows[0].id;
      academicYearName = yearRows[0].name;
    }

    if (!student.section_id) {
      return {
        academicYearId,
        academicYearName,
        totalWorkingDays: 0,
        present: 0,
        absent: 0,
        late: 0,
        leave: 0,
        attendancePercent: 0,
        recentHistory: [],
      };
    }

    // Count by status
    const counts = await this.tenantPrisma.query<AttendanceCountRow>(
      `SELECT status, COUNT(*) AS count
       FROM student_attendance
       WHERE student_id = $1::uuid AND academic_year_id = $2::uuid
       GROUP BY status`,
      student.id,
      academicYearId,
    );

    // Total working days for the section
    const workingDaysRows = await this.tenantPrisma.query<WorkingDaysRow>(
      `SELECT COUNT(DISTINCT date) AS working_days
       FROM student_attendance
       WHERE section_id = $1::uuid AND academic_year_id = $2::uuid`,
      student.section_id,
      academicYearId,
    );

    // Recent 30 days history
    const historyRows = await this.tenantPrisma.query<AttendanceHistoryRow>(
      `SELECT date, status
       FROM student_attendance
       WHERE student_id = $1::uuid
         AND date >= CURRENT_DATE - INTERVAL '30 days'
       ORDER BY date DESC`,
      student.id,
    );

    const countMap: Record<string, number> = {};
    for (const c of counts) countMap[c.status] = parseInt(c.count, 10);

    const present = countMap['PRESENT'] ?? 0;
    const absent = countMap['ABSENT'] ?? 0;
    const late = countMap['LATE'] ?? 0;
    const leave = countMap['LEAVE'] ?? 0;
    const totalWorkingDays = parseInt(workingDaysRows[0]?.working_days ?? '0', 10);

    const attendancePercent =
      totalWorkingDays > 0
        ? Math.round(((present + late) / totalWorkingDays) * 1000) / 10
        : 0;

    return {
      academicYearId,
      academicYearName,
      totalWorkingDays,
      present,
      absent,
      late,
      leave,
      attendancePercent,
      recentHistory: historyRows.map((h) => ({
        dateAd: toAdString(h.date),
        status: h.status,
      })),
    };
  }

  /** GET /students/me/attendance/history?fromDate=&toDate=&page=&limit= */
  async getMyAttendanceHistory(userId: string, dto: StudentMeAttendanceHistoryDto) {
    const student = await this.resolveStudent(userId);

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 31;
    const offset = (page - 1) * limit;

    // Resolve date range — default to current academic year start/end
    let fromDate = dto.fromDate;
    let toDate = dto.toDate;

    if (!fromDate || !toDate) {
      const yearRows = await this.tenantPrisma.query<AcademicYearRow>(
        `SELECT id, name, start_date, end_date
         FROM academic_years
         WHERE is_current = true AND deleted_at IS NULL
         LIMIT 1`,
      );
      if (yearRows[0]) {
        if (!fromDate) fromDate = toAdString(yearRows[0].start_date);
        if (!toDate) toDate = toAdString(yearRows[0].end_date);
      }
    }

    const conditions: string[] = ['student_id = $1::uuid'];
    const params: unknown[] = [student.id];
    let idx = 2;

    if (fromDate) { conditions.push(`date >= $${idx++}::date`); params.push(fromDate); }
    if (toDate) { conditions.push(`date <= $${idx++}::date`); params.push(toDate); }

    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<AttendanceHistoryRow & { total_count: string }>(
      `SELECT date, status, remarks, COUNT(*) OVER() AS total_count
       FROM student_attendance
       WHERE ${conditions.join(' AND ')}
       ORDER BY date DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;

    return {
      data: rows.map((r) => ({
        dateAd: toAdString(r.date),
        status: r.status,
        remarks: r.remarks,
      })),
      meta: { page, limit, total },
    };
  }
}
