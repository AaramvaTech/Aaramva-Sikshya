export interface StudentProfile {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  gender: string | null;
  photoUrl: string | null;
  currentEnrollment: {
    className: string;
    sectionName: string;
    rollNumber: number | null;
    academicYearId: string;
    academicYearName: string;
  } | null;
}

export interface TimetablePeriod {
  slotId: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  subject: { id: string; name: string; code: string | null };
  teacher: { id: string; fullName: string };
  room: string | null;
}

export interface TimetableResponse {
  dayOfWeek: number;
  dateAd: string;
  isSchoolDay: boolean;
  periods: TimetablePeriod[];
}

export interface AttendanceSummary {
  academicYearId: string;
  academicYearName: string;
  totalWorkingDays: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
  attendancePercent: number;
  recentHistory: { dateAd: string; status: string }[];
}

export interface AttendanceHistoryItem {
  dateAd: string;
  status: string;
  remarks: string | null;
}

export interface NoticeItem {
  id: string;
  title: string;
  body: string;
  type: string;
  audience: string;
  publishedAt: string | null;
  createdAt: string;
}

// ─── Parent / Guardian types ─────────────────────────────────────────────────

export interface MyChild {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  relation: string;
  currentEnrollment: {
    className: string;
    sectionName: string;
    rollNumber: number | null;
    sectionId: string | null;
    academicYearId: string | null;
    academicYearName: string | null;
  } | null;
}

export interface ChildAttendanceSummary {
  academicYearId: string;
  academicYearName: string;
  totalWorkingDays: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
  attendancePercent: number;
}

export interface ExamResult {
  studentId: string;
  examTypeId: string;
  examTypeName: string;
  results: {
    subjectId: string;
    subjectName: string;
    fullMark: number;
    passmark: number;
    marksObtained: number | null;
    grade: string | null;
    gradePoint: number | null;
    remarks: string | null;
  }[];
  rank: number | null;
  totalMarks: number | null;
  percentage: number | null;
  gpa: number | null;
  overallGrade: string | null;
}

export interface ReportCard {
  studentId: string;
  studentName: string;
  academicYearId: string;
  academicYearName: string;
  results: ExamResult[];
  annualGpa: number | null;
  annualGrade: string | null;
}

export interface FeeAssignment {
  id: string;
  feeCategoryId: string;
  feeCategoryName: string;
  amount: number;
  dueDate: string;
  status: string;
  paidAmount: number;
  balance: number;
}

export interface LedgerEntry {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  referenceId: string | null;
  type: 'invoice' | 'payment';
}

export interface StudentLedger {
  studentId: string;
  entries: LedgerEntry[];
  totalFees: number;
  totalPaid: number;
  outstanding: number;
}

export interface SectionTimetableSlot {
  slotId: string;
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday (JS convention)
  periodNumber: number;
  startTime: string;
  endTime: string;
  subject: { id: string; name: string; code: string | null };
  teacher: { id: string; fullName: string };
  room: string | null;
}

// ─── Teacher types ────────────────────────────────────────────────────────────

export interface TeacherSlotItem {
  slotId: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  subject: { id: string; name: string; code: string | null };
  section: string;
  className: string;
  room: string | null;
}

export interface TeacherTimetable {
  teacherId: string;
  teacherName: string;
  schedule: Record<number, TeacherSlotItem[]>;
}

export interface MySection {
  sectionId: string;
  sectionName: string;
  className: string;
  classId: string;
}

export interface StaffProfile {
  id: string;
  userId: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  departmentId: string | null;
  departmentName: string | null;
  designationId: string | null;
  designationTitle: string | null;
  gender: string | null;
  phone: string | null;
  joinDate: string;
  employmentType: string;
  baseSalary: string;
  photoUrl: string | null;
}

export interface StaffAttendanceSummary {
  present: number;
  absent: number;
  late: number;
  leave: number;
  holiday: number;
  total: number;
}

export interface StaffAttendanceRecord {
  id: string;
  userId: string;
  date: string; // AD ISO string
  status: string;
  remarks: string | null;
}

export interface LeaveType {
  id: string;
  name: string;
  daysPerYear: number;
  isPaid: boolean;
}

export interface LeaveRequest {
  id: string;
  userId: string;
  leaveTypeId: string;
  leaveTypeName: string | undefined;
  fromDate: { ad: string; bs: string };
  toDate: { ad: string; bs: string };
  totalDays: number;
  reason: string | null;
  status: string;
  appliedAt: string;
  reviewerNote: string | null;
}

export interface SectionAttendanceRecord {
  id: string;
  studentId: string;
  sectionId: string;
  date: { ad: string; bs: string };
  status: string;
  remarks: string | null;
}

// ─── Marks / Exam types ───────────────────────────────────────────────────────

export interface ExamSchedule {
  examScheduleId: string;
  examTypeId: string;
  examTypeName: string;
  subjectId: string;
  subjectName: string;
  classId: string;
  className: string;
  examDate: string; // AD ISO date string
  startTime: string | null;
  fullMarks: number;
  passMarks: number;
  theoryMarks: number | null;
  practicalMarks: number | null;
}

export interface ExamMark {
  studentId: string;
  marksObtained: number | null;
  theoryMarks: number | null;
  practicalMarks: number | null;
  isAbsent: boolean;
  remarks: string | null;
}

export interface BulkMarkEntry {
  studentId: string;
  marksObtained?: number;
  theoryMarks?: number;
  practicalMarks?: number;
  isAbsent: boolean;
  remarks?: string;
}
