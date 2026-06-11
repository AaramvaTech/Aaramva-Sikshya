import { adToBs } from 'bs-calendar';

// ─── Row types ────────────────────────────────────────────────────────────────

export interface StudentAttendanceRow {
  id: string;
  student_id: string;
  section_id: string;
  academic_year_id: string;
  date: Date | string;
  status: string;
  remarks: string | null;
  marked_by: string;
  marked_at: Date | string;
  updated_at: Date | string;
  total_count?: string;
}

export interface StaffAttendanceRow {
  id: string;
  user_id: string;
  date: Date | string;
  status: string;
  check_in: string | null;
  check_out: string | null;
  remarks: string | null;
  marked_by: string;
  marked_at: Date | string;
  updated_at: Date | string;
  total_count?: string;
}

export interface LeaveApplicationRow {
  id: string;
  student_id: string;
  academic_year_id: string;
  from_date: Date | string;
  to_date: Date | string;
  reason: string;
  status: string;
  applied_by: string;
  reviewed_by: string | null;
  reviewed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export interface BsAdDate {
  ad: string;
  bs: string;
}

export interface StudentAttendanceResponseDto {
  id: string;
  studentId: string;
  sectionId: string;
  academicYearId: string;
  date: BsAdDate;
  status: string;
  remarks: string | null;
  markedBy: string;
  markedAt: string;
}

export interface StaffAttendanceResponseDto {
  id: string;
  userId: string;
  date: BsAdDate;
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  remarks: string | null;
  markedBy: string;
  markedAt: string;
}

export interface LeaveApplicationResponseDto {
  id: string;
  studentId: string;
  academicYearId: string;
  fromDate: BsAdDate;
  toDate: BsAdDate;
  reason: string;
  status: string;
  appliedBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface StudentSummaryDto {
  studentId: string;
  studentName: string;
  academicYearId: string;
  totalWorkingDays: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
  attendancePercent: number;
  recentHistory: { ad: string; bs: string; status: string }[];
}

export interface SectionReportDto {
  sectionId: string;
  sectionName: string;
  className: string;
  fromDate: BsAdDate;
  toDate: BsAdDate;
  dates: string[];
  students: {
    studentId: string;
    admissionNumber: string;
    fullName: string;
    rollNumber: number | null;
    attendance: Record<string, 'P' | 'A' | 'L' | 'LV' | '-'>;
    summary: { present: number; absent: number; late: number; leave: number; total: number; percent: number };
  }[];
}

export interface SchoolSummaryDto {
  date: BsAdDate;
  totalStudents: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
  notMarked: number;
  attendanceRate: number;
  byClass: {
    classId: string;
    className: string;
    present: number;
    absent: number;
    total: number;
    rate: number;
  }[];
  bySection: {
    classId: string;
    className: string;
    sectionId: string;
    sectionName: string;
    present: number;
    absent: number;
    late: number;
    leave: number;
    total: number;
    rate: number;
  }[];
}

export interface StaffSummaryDto {
  userId: string;
  month: number;
  year: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
  holiday: number;
  total: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function toAdString(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().split('T')[0];
}

export function toBsString(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  const bs = adToBs(date);
  return `${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')}`;
}

export function toDateField(d: Date | string): BsAdDate {
  return { ad: toAdString(d), bs: toBsString(d) };
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function toStudentAttendanceResponse(row: StudentAttendanceRow): StudentAttendanceResponseDto {
  return {
    id: row.id,
    studentId: row.student_id,
    sectionId: row.section_id,
    academicYearId: row.academic_year_id,
    date: toDateField(row.date),
    status: row.status,
    remarks: row.remarks,
    markedBy: row.marked_by,
    markedAt: row.marked_at instanceof Date ? row.marked_at.toISOString() : String(row.marked_at),
  };
}

export function toStaffAttendanceResponse(row: StaffAttendanceRow): StaffAttendanceResponseDto {
  return {
    id: row.id,
    userId: row.user_id,
    date: toDateField(row.date),
    status: row.status,
    checkIn: row.check_in,
    checkOut: row.check_out,
    remarks: row.remarks,
    markedBy: row.marked_by,
    markedAt: row.marked_at instanceof Date ? row.marked_at.toISOString() : String(row.marked_at),
  };
}

export function toLeaveApplicationResponse(row: LeaveApplicationRow): LeaveApplicationResponseDto {
  return {
    id: row.id,
    studentId: row.student_id,
    academicYearId: row.academic_year_id,
    fromDate: toDateField(row.from_date),
    toDate: toDateField(row.to_date),
    reason: row.reason,
    status: row.status,
    appliedBy: row.applied_by,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at
      ? (row.reviewed_at instanceof Date ? row.reviewed_at.toISOString() : String(row.reviewed_at))
      : null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}
