import { Injectable } from '@nestjs/common';
import { getCurrentFiscalYear } from 'bs-calendar';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { toTimeString } from '../academic/entities/academic.entity';
import {
  BsAdDate,
  toDateField,
  DashboardOverviewDto,
  WeeklyAttendanceDto,
  WeeklyAttendanceDayDto,
  RecentActivityDto,
  UpcomingEventsDto,
  UpcomingExamDto,
  ClassAttendanceBreakdown,
} from './entities/dashboard.entity';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

@Injectable()
export class DashboardService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async getOverview(): Promise<DashboardOverviewDto> {
    const today = new Date().toISOString().split('T')[0] as string;
    const asOf: BsAdDate = toDateField(today);

    // ── 1. Student counts ─────────────────────────────────────────────────
    const studentRows = await this.tenantPrisma.query<{
      total: string;
      active: string;
    }>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active
       FROM students WHERE deleted_at IS NULL`,
    );
    const studentTotal = studentRows[0] ? parseInt(studentRows[0].total, 10) : 0;
    const studentActive = studentRows[0] ? parseInt(studentRows[0].active, 10) : 0;

    // ── 2. Today's attendance ─────────────────────────────────────────────
    const attendanceRows = await this.tenantPrisma.query<{
      class_id: string;
      class_name: string;
      total: string;
      present: string;
      absent: string;
      late: string;
      leave: string;
      marked: string;
    }>(
      `SELECT
         c.id AS class_id, c.name AS class_name,
         COUNT(DISTINCT s.id)                                           AS total,
         COUNT(DISTINCT CASE WHEN sa.status = 'PRESENT' THEN s.id END) AS present,
         COUNT(DISTINCT CASE WHEN sa.status = 'ABSENT'  THEN s.id END) AS absent,
         COUNT(DISTINCT CASE WHEN sa.status = 'LATE'    THEN s.id END) AS late,
         COUNT(DISTINCT CASE WHEN sa.status = 'LEAVE'   THEN s.id END) AS leave,
         COUNT(DISTINCT CASE WHEN sa.id IS NOT NULL      THEN s.id END) AS marked
       FROM students s
       JOIN sections sec ON s.section_id = sec.id
       JOIN classes  c   ON sec.class_id  = c.id
       LEFT JOIN student_attendance sa ON sa.student_id = s.id AND sa.date = $1::date
       WHERE s.deleted_at IS NULL
       GROUP BY c.id, c.name
       ORDER BY c.order_index`,
      today,
    );

    let totalStudents = 0;
    let present = 0;
    let absent = 0;
    let late = 0;
    let leave = 0;
    let marked = 0;
    const byClass: ClassAttendanceBreakdown[] = attendanceRows.map((r) => {
      const t = parseInt(r.total, 10);
      const p = parseInt(r.present, 10);
      const a = parseInt(r.absent, 10);
      totalStudents += t;
      present += p;
      absent += a;
      late += parseInt(r.late, 10);
      leave += parseInt(r.leave, 10);
      marked += parseInt(r.marked, 10);
      return {
        classId: r.class_id,
        className: r.class_name,
        present: p,
        absent: a,
        total: t,
        rate: t > 0 ? Math.round((p / t) * 1000) / 10 : 0,
      };
    });

    const notMarked = totalStudents - marked;
    const attendanceRate = totalStudents > 0
      ? Math.round((present / totalStudents) * 1000) / 10
      : 0;

    // ── 3. Fee collection (needs current academic year) ───────────────────
    const academicYearRows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM academic_years WHERE is_current = true AND deleted_at IS NULL LIMIT 1`,
    );

    let fees: DashboardOverviewDto['fees'] = null;
    if (academicYearRows[0]) {
      const academicYearId = academicYearRows[0].id;
      const fiscalYear = getCurrentFiscalYear();

      const feeRows = await this.tenantPrisma.query<{
        invoiced: string;
        collected: string;
      }>(
        `SELECT
           COALESCE(SUM(i.total_amount), 0) AS invoiced,
           COALESCE(SUM(i.paid_amount), 0) AS collected
         FROM invoices i
         WHERE i.academic_year_id = $1::uuid AND i.deleted_at IS NULL`,
        academicYearId,
      );

      const totalInvoiced = feeRows[0] ? Math.round(parseFloat(feeRows[0].invoiced) * 100) / 100 : 0;
      const totalCollected = feeRows[0] ? Math.round(parseFloat(feeRows[0].collected) * 100) / 100 : 0;
      const totalPending = Math.round((totalInvoiced - totalCollected) * 100) / 100;
      const collectionRate = totalInvoiced > 0
        ? Math.round((totalCollected / totalInvoiced) * 10000) / 100
        : 0;

      fees = {
        fiscalYear,
        academicYearId,
        asOf,
        totalInvoiced,
        totalCollected,
        totalPending,
        collectionRate,
      };
    }

    // ── 4. Unread notifications (school-wide count) ───────────────────────
    const notifRows = await this.tenantPrisma.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM notifications WHERE is_read = false`,
    );
    const unreadNotifications = notifRows[0] ? parseInt(notifRows[0].count, 10) : 0;

    return {
      asOf,
      students: { total: studentTotal, active: studentActive },
      attendance: {
        date: asOf,
        totalStudents,
        present,
        absent,
        late,
        leave,
        notMarked,
        attendanceRate,
        byClass,
      },
      fees,
      unreadNotifications,
    };
  }

  async getWeeklyAttendance(): Promise<WeeklyAttendanceDto> {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - 6);

    const rows = await this.tenantPrisma.query<{
      date: string;
      present: string;
      total: string;
    }>(
      `SELECT
         sa.date,
         COUNT(*) FILTER (WHERE sa.status IN ('PRESENT', 'LATE')) AS present,
         COUNT(*) AS total
       FROM student_attendance sa
       JOIN students s ON s.id = sa.student_id
       WHERE sa.date >= $1::date AND sa.date <= $2::date
         AND s.deleted_at IS NULL
       GROUP BY sa.date
       ORDER BY sa.date`,
      weekStart.toISOString().split('T')[0],
      today.toISOString().split('T')[0],
    );

    // Build a map of existing data
    const dataMap = new Map<string, { present: number; total: number }>();
    for (const r of rows) {
      dataMap.set(r.date, {
        present: parseInt(r.present, 10),
        total: parseInt(r.total, 10),
      });
    }

    // Fill all 7 days (including days with no data)
    const days: WeeklyAttendanceDayDto[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const dateStr = d.toISOString().split('T')[0] as string;
      const entry = dataMap.get(dateStr);
      const present = entry?.present ?? 0;
      const total = entry?.total ?? 0;
      days.push({
        date: toDateField(dateStr),
        dayOfWeek: DAY_NAMES[d.getDay()] ?? '',
        present,
        total,
        rate: total > 0 ? Math.round((present / total) * 1000) / 10 : 0,
      });
    }

    return {
      weekStart: toDateField(weekStart),
      weekEnd: toDateField(today),
      days,
    };
  }

  async getRecentActivity(): Promise<RecentActivityDto> {
    // Recent students
    const studentRows = await this.tenantPrisma.query<{
      id: string;
      first_name: string;
      last_name: string;
      admission_date: string | null;
    }>(
      `SELECT id, first_name, last_name, admission_date
       FROM students WHERE deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 5`,
    );

    // Recent payments
    const paymentRows = await this.tenantPrisma.query<{
      id: string;
      student_first: string;
      student_last: string;
      amount: string;
      created_at: Date | string;
    }>(
      `SELECT p.id, s.first_name AS student_first, s.last_name AS student_last,
              p.amount, p.created_at
       FROM payments p
       JOIN students s ON s.id = p.student_id
       WHERE p.deleted_at IS NULL
       ORDER BY p.created_at DESC LIMIT 5`,
    );

    // Recent notices
    const noticeRows = await this.tenantPrisma.query<{
      id: string;
      title: string;
      published_at: Date | string | null;
    }>(
      `SELECT id, title, published_at
       FROM notices WHERE deleted_at IS NULL AND is_published = true
       ORDER BY COALESCE(published_at, created_at) DESC LIMIT 5`,
    );

    return {
      recentStudents: studentRows.map((r) => ({
        id: r.id,
        name: `${r.first_name} ${r.last_name}`.trim(),
        admittedAt: r.admission_date
          ? toDateField(r.admission_date)
          : toDateField(new Date()),
      })),
      recentPayments: paymentRows.map((r) => ({
        id: r.id,
        studentName: `${r.student_first} ${r.student_last}`.trim(),
        amount: Math.round(parseFloat(r.amount) * 100) / 100,
        createdAt: toDateField(r.created_at),
      })),
      recentNotices: noticeRows.map((r) => ({
        id: r.id,
        title: r.title,
        publishedAt: r.published_at ? toDateField(r.published_at) : null,
      })),
    };
  }

  async getUpcoming(): Promise<UpcomingEventsDto> {
    const today = new Date().toISOString().split('T')[0] as string;

    const examRows = await this.tenantPrisma.query<{
      id: string;
      subject_name: string;
      class_name: string;
      exam_date: string;
      start_time: string;
      end_time: string;
    }>(
      `SELECT es.id, sub.name AS subject_name, c.name AS class_name,
              es.exam_date, es.start_time, es.end_time
       FROM exam_schedules es
       JOIN subjects sub ON sub.id = es.subject_id
       JOIN classes c ON c.id = es.class_id
       WHERE es.exam_date >= $1::date AND es.deleted_at IS NULL
       ORDER BY es.exam_date, es.start_time
       LIMIT 10`,
      today,
    );

    const exams: UpcomingExamDto[] = examRows.map((r) => ({
      id: r.id,
      subjectName: r.subject_name,
      className: r.class_name,
      examDate: toDateField(r.exam_date),
      // Wrap with the shared time helper (R2 fix) so TIME columns returned as
      // Date objects don't leak "1970-01-01T…" strings — emit clean "HH:MM".
      startTime: toTimeString(r.start_time),
      endTime: toTimeString(r.end_time),
    }));

    return { exams };
  }
}
