import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { Role } from '../common/enums/role.enum';
import { GuardianScopeService } from '../student/guardian-scope.service';
import { CalendarService } from '../calendar/calendar.service';
import { todayAdInNepal } from '../common/utils/date.util';
import {
  StudentAttendanceRow,
  StudentSummaryDto,
  SectionReportDto,
  SchoolSummaryDto,
  toStudentAttendanceResponse,
  toAdString,
  toBsString,
  toDateField,
} from './entities/attendance.entity';
import {
  BulkStudentAttendanceDto,
  GetAttendanceQueryDto,
  GetSectionReportQueryDto,
  GetStudentHistoryQueryDto,
} from './dto/student-attendance.dto';

@Injectable()
export class StudentAttendanceService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly eventEmitter: EventEmitter2,
    private readonly guardianScope: GuardianScopeService,
    private readonly calendarService: CalendarService,
  ) {}

  async bulkMark(dto: BulkStudentAttendanceDto, markedById: string): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const markDate = new Date(dto.date);
    markDate.setHours(0, 0, 0, 0);
    if (markDate > today) {
      throw new BadRequestException('Cannot mark attendance for future dates');
    }

    // CAL-1 Phase 5: don't allow marking attendance on a holiday. Checks the
    // holiday condition specifically (not isWorkingDay) — Saturday is a
    // separate, pre-existing platform concept this isn't re-scoping.
    if (await this.calendarService.isHoliday(dto.date)) {
      throw new BadRequestException('Cannot mark attendance on a holiday');
    }

    await this.tenantPrisma.run(async (tx) => {
      const studentIds = dto.records.map((r) => r.studentId);

      // Look up section name for legacy fallback check
      const sectionRows = await tx.$queryRawUnsafe<{ name: string }[]>(
        `SELECT name FROM sections WHERE id = $1::uuid`,
        dto.sectionId,
      );
      const sectionName = sectionRows[0]?.name ?? null;

      // Accept students enrolled by UUID OR by name (section_id IS NULL = pre-fix legacy data)
      const enrolled = await tx.$queryRawUnsafe<{ id: string; section_id: string | null }[]>(
        `SELECT id, section_id FROM students
         WHERE id = ANY($1::uuid[])
           AND deleted_at IS NULL
           AND (
             section_id = $2::uuid
             OR (section_id IS NULL AND $3::text IS NOT NULL AND section_name = $3)
           )`,
        studentIds,
        dto.sectionId,
        sectionName,
      );
      const enrolledIds = new Set(enrolled.map((s) => s.id));
      const missing = studentIds.filter((id) => !enrolledIds.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(
          `Students not enrolled in section: ${missing.join(', ')}`,
        );
      }

      // Backfill section_id for legacy students matched by name
      const legacyIds = enrolled.filter((s) => s.section_id === null).map((s) => s.id);
      if (legacyIds.length > 0) {
        await tx.$executeRawUnsafe(
          `UPDATE students SET section_id = $1::uuid
           WHERE id = ANY($2::uuid[]) AND section_id IS NULL`,
          dto.sectionId,
          legacyIds,
        );
      }

      for (const record of dto.records) {
        await tx.$executeRawUnsafe(
          `INSERT INTO student_attendance
             (student_id, section_id, academic_year_id, date, status, remarks, marked_by)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5, $6, $7::uuid)
           ON CONFLICT (student_id, date, academic_year_id)
           DO UPDATE SET
             status     = EXCLUDED.status,
             remarks    = EXCLUDED.remarks,
             marked_by  = EXCLUDED.marked_by,
             updated_at = NOW()`,
          record.studentId,
          dto.sectionId,
          dto.academicYearId,
          dto.date,
          record.status,
          record.remarks ?? null,
          markedById,
        );
      }
    });

    const absentStudents = dto.records.filter((r) => r.status === 'ABSENT');
    if (absentStudents.length > 0) {
      const { slug } = this.tenantContext.getOrThrow();
      this.eventEmitter.emit('attendance.absent', {
        tenantSlug: slug,
        date: dto.date,
        absentStudents: absentStudents.map((r) => ({ studentId: r.studentId })),
      });
    }
  }

  async getByQuery(query: GetAttendanceQueryDto): Promise<{
    data: ReturnType<typeof toStudentAttendanceResponse>[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (query.sectionId) { conditions.push(`sa.section_id = $${idx++}::uuid`); params.push(query.sectionId); }
    if (query.studentId) { conditions.push(`sa.student_id = $${idx++}::uuid`); params.push(query.studentId); }
    if (query.academicYearId) { conditions.push(`sa.academic_year_id = $${idx++}::uuid`); params.push(query.academicYearId); }
    if (query.status) { conditions.push(`sa.status = $${idx++}`); params.push(query.status); }
    if (query.date) { conditions.push(`sa.date = $${idx++}::date`); params.push(query.date); }
    if (query.fromDate) { conditions.push(`sa.date >= $${idx++}::date`); params.push(query.fromDate); }
    if (query.toDate) { conditions.push(`sa.date <= $${idx++}::date`); params.push(query.toDate); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<StudentAttendanceRow & { total_count: string }>(
      `SELECT sa.*, COUNT(*) OVER() AS total_count
       FROM student_attendance sa
       ${where}
       ORDER BY sa.date DESC, sa.student_id
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return {
      data: rows.map(toStudentAttendanceResponse),
      meta: { page, limit, total },
    };
  }

  async getStudentHistory(
    studentId: string,
    query: GetStudentHistoryQueryDto,
    callerId?: string,
    callerRole?: Role,
  ) {
    if (callerRole === Role.PARENT && callerId) {
      await this.guardianScope.assertOwnsStudent(callerId, studentId);
    }
    return this.getByQuery({ ...query, studentId });
  }

  async getStudentSummary(
    studentId: string,
    academicYearId: string,
    callerId?: string,
    callerRole?: Role,
  ): Promise<StudentSummaryDto> {
    if (callerRole === Role.PARENT && callerId) {
      await this.guardianScope.assertOwnsStudent(callerId, studentId);
    }
    const students = await this.tenantPrisma.query<{
      id: string;
      full_name: string;
      section_id: string;
    }>(
      `SELECT id, first_name || ' ' || last_name AS full_name, section_id
       FROM students WHERE id = $1::uuid AND deleted_at IS NULL`,
      studentId,
    );
    if (!students[0]) throw new NotFoundException(`Student ${studentId} not found`);
    const student = students[0];

    // CAL-1 Phase 5: exclude holiday dates from both the count and the
    // working-days denominator — defense in depth alongside bulkMark's
    // write-side guard, for any row marked before that guard existed.
    const counts = await this.tenantPrisma.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) AS count
       FROM student_attendance
       WHERE student_id = $1::uuid AND academic_year_id = $2::uuid
         AND date NOT IN (SELECT date FROM school_calendar_days WHERE is_holiday = true AND deleted_at IS NULL)
       GROUP BY status`,
      studentId,
      academicYearId,
    );

    const workingDaysRows = await this.tenantPrisma.query<{ working_days: string }>(
      `SELECT COUNT(DISTINCT date) AS working_days
       FROM student_attendance
       WHERE section_id = $1::uuid AND academic_year_id = $2::uuid
         AND date NOT IN (SELECT date FROM school_calendar_days WHERE is_holiday = true AND deleted_at IS NULL)`,
      student.section_id,
      academicYearId,
    );

    const history = await this.tenantPrisma.query<{ date: Date | string; status: string }>(
      `SELECT date, status
       FROM student_attendance
       WHERE student_id = $1::uuid
         AND date >= CURRENT_DATE - INTERVAL '30 days'
         AND date NOT IN (SELECT date FROM school_calendar_days WHERE is_holiday = true AND deleted_at IS NULL)
       ORDER BY date DESC`,
      studentId,
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
      studentId,
      studentName: student.full_name,
      academicYearId,
      totalWorkingDays,
      present,
      absent,
      late,
      leave,
      attendancePercent,
      recentHistory: history.map((h) => ({
        ad: toAdString(h.date),
        bs: toBsString(h.date),
        status: h.status,
      })),
    };
  }

  async getSectionReport(
    sectionId: string,
    query: GetSectionReportQueryDto,
  ): Promise<SectionReportDto> {
    const sectionRows = await this.tenantPrisma.query<{
      section_name: string;
      class_name: string;
    }>(
      `SELECT sec.name AS section_name, c.name AS class_name
       FROM sections sec
       JOIN classes c ON sec.class_id = c.id
       WHERE sec.id = $1::uuid AND sec.deleted_at IS NULL`,
      sectionId,
    );
    if (!sectionRows[0]) throw new NotFoundException(`Section ${sectionId} not found`);
    const { section_name, class_name } = sectionRows[0];

    const dateRows = await this.tenantPrisma.query<{ date: Date | string }>(
      `SELECT DISTINCT date FROM student_attendance
       WHERE section_id = $1::uuid AND date BETWEEN $2::date AND $3::date
       ORDER BY date`,
      sectionId,
      query.fromDate,
      query.toDate,
    );
    const dates = dateRows.map((r) => toAdString(r.date));

    const studentRows = await this.tenantPrisma.query<{
      id: string;
      student_id: string;
      full_name: string;
      roll_number: number | null;
    }>(
      `SELECT s.id, s.student_id, s.first_name || ' ' || s.last_name AS full_name, s.roll_number
       FROM students s
       WHERE s.section_id = $1::uuid AND s.deleted_at IS NULL
       ORDER BY s.roll_number NULLS LAST, s.last_name`,
      sectionId,
    );

    const attendanceRows = await this.tenantPrisma.query<{
      student_id: string;
      date: Date | string;
      status: string;
    }>(
      `SELECT student_id, date, status
       FROM student_attendance
       WHERE section_id = $1::uuid
         AND date BETWEEN $2::date AND $3::date
         AND academic_year_id = $4::uuid`,
      sectionId,
      query.fromDate,
      query.toDate,
      query.academicYearId,
    );

    const attendanceMap: Record<string, Record<string, string>> = {};
    for (const row of attendanceRows) {
      const dateStr = toAdString(row.date);
      if (!attendanceMap[row.student_id]) attendanceMap[row.student_id] = {};
      attendanceMap[row.student_id][dateStr] = row.status;
    }

    const STATUS_CHAR: Record<string, 'P' | 'A' | 'L' | 'LV'> = {
      PRESENT: 'P',
      ABSENT: 'A',
      LATE: 'L',
      LEAVE: 'LV',
    };

    const students = studentRows.map((s) => {
      const studentAttendance = attendanceMap[s.id] ?? {};
      const attendance: Record<string, 'P' | 'A' | 'L' | 'LV' | '-'> = {};
      let present = 0, absent = 0, late = 0, leave = 0;

      for (const date of dates) {
        const raw = studentAttendance[date];
        if (!raw) {
          attendance[date] = '-';
        } else {
          attendance[date] = STATUS_CHAR[raw] ?? '-';
          if (raw === 'PRESENT') present++;
          else if (raw === 'ABSENT') absent++;
          else if (raw === 'LATE') late++;
          else if (raw === 'LEAVE') leave++;
        }
      }

      const total = present + absent + late + leave;
      const percent = total > 0 ? Math.round(((present + late) / total) * 1000) / 10 : 0;

      return {
        studentId: s.id,
        admissionNumber: s.student_id,
        fullName: s.full_name,
        rollNumber: s.roll_number,
        attendance,
        summary: { present, absent, late, leave, total, percent },
      };
    });

    return {
      sectionId,
      sectionName: section_name,
      className: class_name,
      fromDate: toDateField(query.fromDate),
      toDate: toDateField(query.toDate),
      dates,
      students,
    };
  }

  async getSchoolSummary(): Promise<SchoolSummaryDto> {
    // QA-1 OBS-E: Nepal-today, not UTC-today (UTC would show yesterday's board
    // for the first 5h45m of each Nepal day).
    const today = todayAdInNepal();

    // Section-level breakdown — the overview UI filters this by grade + section.
    const rows = await this.tenantPrisma.query<{
      class_id: string;
      class_name: string;
      section_id: string;
      section_name: string;
      total: string;
      present: string;
      absent: string;
      late: string;
      leave: string;
      marked: string;
    }>(
      `SELECT
         c.id AS class_id, c.name AS class_name,
         sec.id AS section_id, sec.name AS section_name,
         COUNT(DISTINCT s.id)                                                 AS total,
         COUNT(DISTINCT CASE WHEN sa.status = 'PRESENT' THEN s.id END)       AS present,
         COUNT(DISTINCT CASE WHEN sa.status = 'ABSENT'  THEN s.id END)       AS absent,
         COUNT(DISTINCT CASE WHEN sa.status = 'LATE'    THEN s.id END)       AS late,
         COUNT(DISTINCT CASE WHEN sa.status = 'LEAVE'   THEN s.id END)       AS leave,
         COUNT(DISTINCT CASE WHEN sa.id IS NOT NULL      THEN s.id END)       AS marked
       FROM students s
       JOIN sections sec ON s.section_id = sec.id
       JOIN classes  c   ON sec.class_id  = c.id
       LEFT JOIN student_attendance sa ON sa.student_id = s.id AND sa.date = $1::date
       WHERE s.deleted_at IS NULL
       GROUP BY c.id, c.name, c.order_index, sec.id, sec.name
       ORDER BY c.order_index, sec.name`,
      today,
    );

    let totalStudents = 0, present = 0, absent = 0, late = 0, leave = 0, marked = 0;

    const bySection = rows.map((r) => {
      const t = parseInt(r.total, 10);
      const p = parseInt(r.present, 10);
      const a = parseInt(r.absent, 10);
      const l = parseInt(r.late, 10);
      const lv = parseInt(r.leave, 10);
      totalStudents += t;
      present += p;
      absent += a;
      late += l;
      leave += lv;
      marked += parseInt(r.marked, 10);
      return {
        classId: r.class_id,
        className: r.class_name,
        sectionId: r.section_id,
        sectionName: r.section_name,
        present: p,
        absent: a,
        late: l,
        leave: lv,
        total: t,
        rate: t > 0 ? Math.round((p / t) * 1000) / 10 : 0,
      };
    });

    // Aggregate the section rows up to a per-class summary (preserves DB ordering).
    const classMap = new Map<string, { classId: string; className: string; present: number; absent: number; total: number }>();
    for (const r of bySection) {
      const acc = classMap.get(r.classId) ?? {
        classId: r.classId,
        className: r.className,
        present: 0,
        absent: 0,
        total: 0,
      };
      acc.present += r.present;
      acc.absent += r.absent;
      acc.total += r.total;
      classMap.set(r.classId, acc);
    }
    const byClass = [...classMap.values()].map((c) => ({
      classId: c.classId,
      className: c.className,
      present: c.present,
      absent: c.absent,
      total: c.total,
      rate: c.total > 0 ? Math.round((c.present / c.total) * 1000) / 10 : 0,
    }));

    const notMarked = totalStudents - marked;
    const attendanceRate = totalStudents > 0
      ? Math.round((present / totalStudents) * 1000) / 10
      : 0;

    return {
      date: toDateField(today),
      totalStudents,
      present,
      absent,
      late,
      leave,
      notMarked,
      attendanceRate,
      byClass,
      bySection,
    };
  }
}
