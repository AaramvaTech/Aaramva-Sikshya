import { adToBs } from 'bs-calendar';

export interface BsAdDate {
  ad: string;
  bs: string;
}

export function toDateField(d: Date | string): BsAdDate {
  const date = d instanceof Date ? d : new Date(d);
  const bs = adToBs(date);
  return {
    ad: date.toISOString().split('T')[0],
    bs: `${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')}`,
  };
}

export interface ClassAttendanceBreakdown {
  classId: string;
  className: string;
  present: number;
  absent: number;
  total: number;
  rate: number;
}

export interface AttendanceOverviewDto {
  date: BsAdDate;
  totalStudents: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
  notMarked: number;
  attendanceRate: number;
  byClass: ClassAttendanceBreakdown[];
}

export interface FeeOverviewDto {
  fiscalYear: string;
  academicYearId: string;
  asOf: BsAdDate;
  totalInvoiced: number;
  totalCollected: number;
  totalPending: number;
  collectionRate: number;
}

export interface DashboardOverviewDto {
  asOf: BsAdDate;
  students: {
    total: number;
    active: number;
  };
  attendance: AttendanceOverviewDto;
  fees: FeeOverviewDto | null;
  unreadNotifications: number;
}

export interface WeeklyAttendanceDayDto {
  date: BsAdDate;
  dayOfWeek: string;
  present: number;
  total: number;
  rate: number;
}

export interface WeeklyAttendanceDto {
  weekStart: BsAdDate;
  weekEnd: BsAdDate;
  days: WeeklyAttendanceDayDto[];
}

export interface RecentStudentDto {
  id: string;
  name: string;
  admittedAt: BsAdDate;
}

export interface RecentPaymentDto {
  id: string;
  studentName: string;
  amount: number;
  createdAt: BsAdDate;
}

export interface RecentNoticeDto {
  id: string;
  title: string;
  publishedAt: BsAdDate | null;
}

export interface RecentActivityDto {
  recentStudents: RecentStudentDto[];
  recentPayments: RecentPaymentDto[];
  recentNotices: RecentNoticeDto[];
}

export interface UpcomingExamDto {
  id: string;
  subjectName: string;
  className: string;
  examDate: BsAdDate;
  startTime: string;
  endTime: string;
}

export interface UpcomingEventsDto {
  exams: UpcomingExamDto[];
}
