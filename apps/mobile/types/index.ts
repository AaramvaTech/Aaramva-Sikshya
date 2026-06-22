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

// ─── Student results / report-card (SESSION-M6) ───────────────────────────────
// Shape mirrors the report-card endpoint → { student, examResults[], annualResult }
// (confirmed via the parent report-card in M4). Built to this contract so the M6.1
// wiring session is a clean swap — only the hook's queryFn changes, not this shape.
export interface ResultSubject {
  name: string;
  /** Theory marks. Always present for theory-bearing subjects. */
  theory: number | null;
  /** Practical marks. `null` for theory-only subjects — render total only. */
  practical: number | null;
  total: number;
  grade: string;
}

export interface ExamTermResult {
  examName: string;
  gpa: number;
  grade: string;
  rank: number;
  subjects: ResultSubject[];
}

export interface AnnualResult {
  gpa: number;
  grade: string;
}

export interface StudentResults {
  student: {
    name: string;
    /** Class label as the API returns it (e.g. "Grade 9"); deduped at display. */
    grade: string;
    section: string;
    roll: number;
    admissionNo: string;
  };
  examResults: ExamTermResult[];
  /** Aggregate annual result — `null` until the school year is closed. */
  annualResult: AnnualResult | null;
}

// Fee config rows (GET /finance/students/:id/assignments) — fee-structure
// definitions with per-student overrides. NOTE: these carry NO payment status
// (no paid/balance/dueDate). Billing status lives on invoices in the ledger,
// which is what the Fees screen renders. Kept for completeness only.
export interface FeeAssignment {
  feeStructureItemId: string;
  feeCategoryName: string;
  originalAmount: number;
  customAmount: number | null;
  discountPercent: number;
  discountReason: string | null;
  isWaived: boolean;
  effectiveAmount: number;
}

// GET /finance/reports/student/:id?academicYearId= — mirrors the backend
// InvoiceResponseDto. dueDate is a BS/AD pair already computed server-side.
export interface Invoice {
  id: string;
  invoiceNumber: string;
  studentId: string;
  academicYearId: string;
  dueDate: { ad: string; bs: string };
  status: string; // UNPAID | PARTIAL | PAID | OVERDUE
  subtotal: number;
  discountAmount: number;
  fineAmount: number;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  items?: { id: string; feeCategoryName: string; originalAmount: number; discountedAmount: number }[];
}

export interface StudentLedger {
  student: { id: string; admissionNumber: string; fullName: string; className: string };
  academicYear: { id: string; name: string };
  invoices: Invoice[];
  summary: { totalInvoiced: number; totalPaid: number; totalBalance: number };
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
