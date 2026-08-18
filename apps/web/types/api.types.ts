export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: { page: number; limit: number; total: number };
}

export interface TenantInfo {
  name: string;
  slug: string;
  logoUrl: string | null;
  /** BRAND-1: the school's chosen accent; null => Aaramva default. */
  primaryColor: string | null;
  /** BRAND-1: server-computed readable ink for primaryColor (#FFFFFF or #0B1220). */
  primaryForeground: string | null;
}

/**
 * The nine RBAC roles — mirrors the backend `Role` enum verbatim
 * (apps/api/src/modules/common/enums/role.enum.ts). Keep in sync by hand;
 * the web app has no shared package with the API.
 */
export type Role =
  | 'PLATFORM_ADMIN'
  | 'SCHOOL_OWNER'
  | 'PRINCIPAL'
  | 'ACADEMIC_COORDINATOR'
  | 'ACCOUNTANT'
  | 'LIBRARIAN'
  | 'TEACHER'
  | 'STUDENT'
  | 'PARENT';

export interface RoleLabel { role: Role; label: string; isOverridden: boolean; }

export interface AuthUser {
  id: string;
  email: string;
  firstName?: string;  // not in login response; populated after getMe
  lastName?: string;
  role: Role;
  tenantId: string | null;
  tenantSlug: string | null;
  // POL-1 T4: true while an emailed temporary password is in effect — the
  // shell keeps the user on /change-password until it clears.
  mustChangePassword?: boolean;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
  tenant: TenantInfo;
}

export interface MeResponse extends AuthUser {
  phone: string | null;
  avatarUrl: string | null;
  tenant: TenantInfo | null;
}

export type LoginDto = { email: string; password: string };

// Paginated response shape — controller returns { data, meta } which gets wrapped by
// ResponseInterceptor, so r.data.data = { data: T[], meta: {...} }
export interface PaginatedResponse<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}

// ── Student Module ──────────────────────────────────────────────────────────

export interface StudentSummary {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  gender: string;
  dateOfBirth: { ad: string; bs: string };
  status: string;
  className: string | null;
  sectionName: string | null;
  rollNumber: number | null;
  photoUrl: string | null;
}

export interface Guardian {
  id: string;
  relation: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  isPrimary: boolean;
  /** REG-1: true when this guardian has a linked PARENT login account. */
  hasAccount: boolean;
}

export interface Enrollment {
  id: string;
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  academicYearId: string;
  academicYearName: string;
  rollNumber: number | null;
  enrolledAt: string;
}

export interface StudentDetail {
  id: string;
  studentId: string;
  tenantId: string;
  /** REG-1: the student's linked STUDENT login account id (null = no account yet). */
  userId: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  dateOfBirth: { ad: string; bs: string };
  gender: string;
  bloodGroup: string | null;
  religion: string | null;
  ethnicity: string | null;
  nationality: string;
  motherTongue: string | null;
  phone: string | null;
  email: string | null;
  permanentAddress: Record<string, string> | null;
  temporaryAddress: Record<string, string> | null;
  guardians: Guardian[];
  className: string | null;
  sectionName: string | null;
  rollNumber: number | null;
  admissionDate: { ad: string; bs: string };
  academicYear: string | null;
  previousSchool: string | null;
  photoUrl: string | null;
  status: string;
  createdAt: string;
}

export interface StudentStats {
  total: number;
  byStatus: { ACTIVE: number; PASSED_OUT: number; EXPELLED: number; TRANSFERRED: number; DROPPED: number };
  byGender: { MALE: number; FEMALE: number; OTHER: number };
  newThisMonth: number;
  byClass: { className: string; count: number }[];
  recentAdmissions: {
    id: string;
    studentId: string;
    fullName: string;
    className: string | null;
    sectionName: string | null;
    admissionDate: { ad: string; bs: string };
    photoUrl: string | null;
    status: string;
  }[];
}

export interface StudentDocument {
  id: string;
  studentId: string;
  documentType: string;
  fileUrl: string;
  fileName: string | null;
  uploadedAt: string;
}

// Student CSV import (OB2)
export interface ImportPreviewRow {
  rowNumber: number;
  data: Record<string, string>;
  status: 'valid' | 'invalid' | 'duplicate';
  errors: string[];
}
export interface ImportPreviewResult {
  header: string[];
  rows: ImportPreviewRow[];
  summary: { total: number; valid: number; invalid: number; duplicate: number };
  context: { academicYearId: string | null; academicYearName: string | null };
}
export interface ImportCommitResult {
  created: {
    rowNumber: number;
    admissionNumber: string;
    studentId: string;
    parentEmail: string;
    parentTempPassword: string | null;
  }[];
  skipped: { rowNumber: number; reason: string }[];
  summary: { created: number; skipped: number };
}

// Onboarding wizard (OB1): step completion is derived from data presence;
// `completed` is the persisted finish/dismiss flag.
export interface OnboardingStatus {
  steps: {
    year: boolean; classes: boolean; sections: boolean; subjects: boolean;
    students: boolean; staff: boolean; branding: boolean;
  };
  currentStep: number;
  academicComplete: boolean;
  completed: boolean;
  completedAt: string | null;
  counts: { hasCurrentYear: boolean; classes: number; sections: number; classSubjects: number; students: number; staff: number };
}

export interface ClassWithSections {
  id: string;
  name: string;
  alias: string | null;
  orderIndex: number;
  sections: { id: string; name: string; capacity: number }[];
}

export interface AcademicYear {
  id: string;
  name: string;
  yearBs: number;
  startDate: { ad: string; bs: string };
  endDate: { ad: string; bs: string };
  isCurrent: boolean;
}

export interface CreateStudentData {
  firstName: string;
  middleName?: string;
  lastName: string;
  dateOfBirth: string; // AD date string "YYYY-MM-DD"
  admissionDate?: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  phone?: string;
  email?: string;
  address?: string;
  bloodGroup?: string;
  religion?: string;
  photoUrl?: string;
  /** FILE-1: storage key from the presign flow — wins over photoUrl */
  photoFileKey?: string;
  classId?: string;
  sectionId?: string;
  academicYearId?: string;
  rollNumber?: number;
  guardians: {
    relation: string;
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    isPrimary: boolean;
  }[];
}

export interface EnrollStudentData {
  classId: string;
  sectionId: string;
  academicYearId: string;
  rollNumber?: number;
}

// ── Attendance Module ───────────────────────────────────────────────────────

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE';

export interface AttendanceRecord {
  id: string;
  studentId: string;
  sectionId: string;
  academicYearId: string;
  date: { ad: string; bs: string };
  status: AttendanceStatus;
  remarks: string | null;
  markedBy: string;
  markedAt: string;
}

export interface BulkAttendanceData {
  sectionId: string;
  academicYearId: string;
  date: string;
  records: {
    studentId: string;
    status: AttendanceStatus;
    remarks?: string;
  }[];
}

export interface StudentAttendanceSummary {
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

// WEB-P Phase 4 — GET /students/me/attendance/summary response shape.
// Distinct from StudentAttendanceSummary above (that's the admin/PARENT-
// facing GET /attendance/students/:studentId/summary — different route,
// different fields: no studentId/studentName here since it's always the
// caller's own; recentHistory uses {dateAd,status} not {ad,bs,status}).
export interface MyAttendanceSummary {
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

export interface MyAttendanceHistoryItem {
  dateAd: string;
  status: string;
  remarks: string | null;
}

// GET /students/me/timetable/today response shape.
export interface MyTodayTimetable {
  dayOfWeek: number;
  dateAd: string;
  isSchoolDay: boolean;
  periods: {
    slotId: string;
    periodNumber: number;
    startTime: string;
    endTime: string;
    subject: { id: string; name: string; code: string | null };
    teacher: { id: string; fullName: string };
    room: string | null;
  }[];
}

// GET /students/me response shape.
export interface StudentMeProfile {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  currentEnrollment: {
    className: string;
    sectionName: string;
    rollNumber: number | null;
    sectionId: string;
    academicYearId: string;
    academicYearName: string;
  } | null;
}

// Student leave application (attendance-leave, distinct from HR staff leave).
// Returned enriched by GET /attendance/leave for the review screen.
export interface StudentLeaveRequest {
  id: string;
  studentId: string;
  academicYearId: string;
  fromDate: { ad: string; bs: string };
  toDate: { ad: string; bs: string };
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  appliedBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewRemarks: string | null;
  createdAt: string;
  studentName: string | null;
  admissionNumber: string | null;
  className: string | null;
  sectionName: string | null;
  appliedByName: string | null;
  reviewedByName: string | null;
}

// WEB-P Phase 5 — GET /students/my-children response shape (array elements).
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
    sectionId: string;
    academicYearId: string;
    academicYearName: string;
  } | null;
}

export interface ReviewLeaveData {
  status: 'APPROVED' | 'REJECTED';
  remarks?: string;
}

export interface SectionAttendanceReport {
  sectionId: string;
  sectionName: string;
  className: string;
  fromDate: { ad: string; bs: string };
  toDate: { ad: string; bs: string };
  dates: string[];
  students: {
    studentId: string;
    admissionNumber: string;
    fullName: string;
    rollNumber: number | null;
    attendance: Record<string, 'P' | 'A' | 'L' | 'LV' | '-'>;
    summary: {
      present: number;
      absent: number;
      late: number;
      leave: number;
      total: number;
      percent: number;
    };
  }[];
}

// WEB-P Phase 2 Task 1 — GET /attendance/staff/my/summary (self-scoped;
// mirrors backend StaffSummaryDto). year/month are AD (Postgres EXTRACT on
// the stored date), not BS — the caller supplies the current AD month.
export interface StaffAttendanceSummary {
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

export interface SchoolAttendanceSummary {
  date: { ad: string; bs: string };
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

// BILLING-CUTOVER Phase 4: old Finance's types (FeeCategory/FeeStructure*/
// FeeAssignment/Invoice*/Payment/CollectionReport/DefaulterReport/StudentLedger/
// the Finance DTOs) removed — all superseded by BillInvoice/BillPayment/etc.
// above and StudentBalance/StudentStatement below.

// ── Academic Module ─────────────────────────────────────────────────────────

export interface Section {
  id: string;
  classId: string;
  name: string;
  capacity: number;
  classTeacherId: string | null;
  classTeacherName: string | null;
}

export interface Subject {
  id: string;
  name: string;
  code: string | null;
  type: 'THEORY' | 'PRACTICAL' | 'BOTH';
}

export interface ClassSubject {
  id: string;
  subjectId: string;
  subjectName: string;
  fullMarks: number;
  passMarks: number;
  academicYearId: string;
}

export interface TimetableSlot {
  slotId: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  subject: { id: string; name: string; code: string | null };
  teacher: { id: string; fullName: string };
  room: string | null;
}

export interface SectionTimetable {
  sectionId: string;
  sectionName: string;
  className: string;
  schedule: Record<string, TimetableSlot[]>;
}

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
  schedule: Record<string, TeacherSlotItem[]>;
}

// WEB-P Phase 2 Task 1 — GET /timetable/my/sections (every section where the
// caller is either the class teacher or has a timetable slot).
export interface TeacherSection {
  sectionId: string;
  sectionName: string;
  className: string;
  classId: string;
}

export interface TimetableSlotData {
  sectionId: string;
  subjectId: string;
  teacherId: string;
  academicYearId: string;
  dayOfWeek: number;
  periodNumber: number;
  startTime: string;
  endTime: string;
  room?: string;
}

// ── Examination Module ──────────────────────────────────────────────────────

export interface ExamType {
  id: string;
  name: string;
  weightPercent: number;
  academicYearId: string;
  orderIndex: number;
  totalWeight: number;
  isComplete: boolean;
  resultsPublished: boolean;
  resultsPublishedAt: string | null;
}

export interface ExamSchedule {
  id: string;
  examTypeId: string;
  classId: string;
  className?: string;   // not joined by backend — resolve from classSubjects on frontend
  subjectId: string;
  subjectName?: string; // not joined by backend — resolve from classSubjects on frontend
  examDate: { ad: string; bs: string };
  startTime: string;
  endTime: string;
  fullMarks: number;
  passMarks: number;
  room: string | null;
}

// WEB-P Phase 2 Task 3 — GET /exams/schedules/my response row. Unlike
// ExamSchedule (whose className/subjectName are optional, admin resolves
// them client-side via classSubjects), the backend joins these directly for
// this endpoint (see toMyExamScheduleResponse), so they're always present.
export interface MyExamSchedule extends ExamSchedule {
  examTypeName: string;
  subjectName: string;
  className: string;
}

export interface MarkRecord {
  id?: string;
  studentId: string;
  studentName?: string;    // not in marks API response; present when built from student list
  admissionNumber?: string;
  rollNumber?: number | null;
  marksObtained: number | null;
  isAbsent: boolean;
  remarks: string | null;
}

export interface ClassResultRow {
  studentId: string;
  admissionNumber: string;
  fullName: string;
  rankInSection: number;
  rankInClass: number;
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  grade: string;
  isPassed: boolean;
  status: string;
  sectionName?: string;
}

export interface ReportCard {
  student: {
    id: string;
    admissionNumber: string;
    fullName: string;
    rollNumber: number | null;
    className: string;
    sectionName: string;
    academicYear: string;
  };
  examResults: {
    examType: { id: string; name: string; weightPercent: number; orderIndex: number };
    percentage: number;
    grade: string;
    gpa: number | null;
    rankInSection: number;
    rankInClass: number;
    isPassed: boolean;
    status: string;
    subjects: {
      subjectId: string;
      subjectName: string;
      fullMarks: number;
      marksObtained: number | null;
      percentage: number | null;
      grade: string | null;
      isPassed: boolean;
      isAbsent: boolean;
    }[];
  }[];
  annualResult: {
    weightedPercentage: number;
    finalGrade: string | null;
    finalGpa: number | null;
    division: string;
    isPassed: boolean;
  };
}

export interface GradingScale {
  id: string;
  name: string;
  isDefault: boolean;
  thresholds: {
    grade: string;
    minPercent: number;
    maxPercent: number;
    gpaPoint: number | null;
    remarks: string | null;
  }[];
}

// POL-1 T6: grading-scale create payload (thresholds immutable after create)
export interface CreateGradingScaleData {
  name: string;
  thresholds: {
    grade: string;
    minPercent: number;
    maxPercent: number;
    gpaPoint?: number;
    remarks?: string;
  }[];
}

export interface ComputeResultSummary {
  computed: number;
  passed: number;
  failed: number;
  absent: number;
}

// Examination DTOs
export interface CreateExamTypeData {
  name: string;
  weightPercent: number;
  academicYearId: string;
  orderIndex: number;
}

export interface BulkCreateScheduleData {
  examTypeId: string;
  classId: string;
  subjects: {
    subjectId: string;
    examDate: string;
    startTime: string;
    endTime: string;
    fullMarks: number;
    passMarks: number;
    room?: string;
  }[];
}

export interface BulkMarksData {
  examScheduleId: string;
  marks: {
    studentId: string;
    marksObtained?: number;
    isAbsent?: boolean;
    remarks?: string;
  }[];
}

// ── HR Module ───────────────────────────────────────────────────────────────

export interface StaffSummary {
  id: string;
  userId: string;
  employeeId: string;
  fullName: string;
  email: string;
  role: string;
  departmentName: string | null;
  designationTitle: string | null;
  employmentTypeId: string;
  employmentTypeName: string | null;
  joinDate: { ad: string; bs: string };
  isActive: boolean;
  photoUrl: string | null;
}

export interface StaffDetail extends StaffSummary {
  departmentId: string | null;
  designationId: string | null;
  phone: string | null;
  dateOfBirth: { ad: string; bs: string } | null;
  gender: string | null;
  permanentAddress: string | null;
  endDate: { ad: string; bs: string } | null;
  baseSalary: number;
  panNumber: string | null;
  bankName: string | null;
  bankAccount: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}

// MAIL-1 resend: POST /hr/staff/:id/resend-credentials
export interface ResendStaffCredentialsResult {
  userId: string;
  deliveryIds: string[];
}

export interface Department { id: string; name: string; }
export interface Designation { id: string; title: string; departmentId: string | null; departmentName?: string | null; }
export interface EmploymentType { id: string; name: string; }
export interface LeaveType { id: string; name: string; daysPerYear: number; isPaid: boolean; }

export interface LeaveRequest {
  id: string;
  userId: string;
  staffName: string;
  leaveTypeName: string;
  fromDate: { ad: string; bs: string };
  toDate: { ad: string; bs: string };
  totalDays: number;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  appliedAt: string;
  reviewerNote: string | null;
  leaveTypeId?: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
}

export interface LeaveBalance {
  leaveTypeId: string;
  leaveTypeName: string;
  entitlement: number;
  used: number;
  balance: number;
}

export interface PayrollMonth {
  id: string;
  monthBs: number;
  yearBs: number;
  status: 'DRAFT' | 'FINALIZED' | 'PAID';
  academicYearId: string;
  createdAt: string;
}

export interface SalarySlipLine { name: string; amount: number; }

export interface SalarySlip {
  id: string;
  payrollMonthId: string;
  userId: string;
  staffProfileId: string;
  staffName: string;
  employeeId: string;
  baseSalary: number;
  allowanceTotal: number;
  allowances: SalarySlipLine[];
  deductionTotal: number;
  deductions: SalarySlipLine[];
  unpaidLeaveDays: number;
  leaveDeduction: number;
  grossSalary: number;
  netSalary: number;
  notes: string | null;
  paymentDate: { ad: string; bs: string } | null;
  paymentMethod: string | null;
  // WEB-P Phase 3 Task 4: always populated (when the slip was generated) —
  // the DTO in apps/api's hr.entity.ts already returns it, this type was
  // just missing it. Used as the per-slip visible date on the teacher's own
  // payroll history screen, since there is no reliable month/year label
  // field (see docs/web/phase-3-ownership-findings.md).
  createdAt: string;
}

export interface CreateStaffData {
  // REG-1 / MAIL-2-OBS-3: password is optional. Omitting it makes the backend
  // generate a temporary password and email the credentials (forced change on
  // first login). The web staff form no longer collects one.
  email: string; password?: string;
  firstName: string; lastName: string; role: string;
  departmentId?: string; designationId?: string;
  dateOfBirth?: string; gender?: string; phone?: string;
  joinDate: string; employmentTypeId: string;
  baseSalary: number; panNumber?: string;
  bankName?: string; bankAccount?: string;
  permanentAddress?: string; temporaryAddress?: string;
  emergencyContactName?: string; emergencyContactPhone?: string;
  photoUrl?: string;
  /** FILE-1: storage key from the presign flow — wins over photoUrl */
  photoFileKey?: string;
}

export interface ApplyLeaveData {
  leaveTypeId: string; fromDate: string; toDate: string; reason?: string;
}

// WEB-P Phase 5 — POST /attendance/leave payload (parent filing leave for a child).
// Distinct from ApplyLeaveData above (which is /hr/leave, staff leave).
export interface ApplyChildLeaveData {
  studentId: string;
  academicYearId: string;
  fromDate: string;
  toDate: string;
  reason: string;
}

export interface PayrollOverride {
  userId: string; customBaseSalary?: number;
  additionalAllowances?: { name: string; amount: number }[];
  additionalDeductions?: { name: string; amount: number }[];
}

export interface StaffDocument {
	  id: string;
	  userId: string;
	  documentType: string;
	  fileUrl: string;
	  fileName: string | null;
	  uploadedAt: string;
	}

// ── Library Module ──────────────────────────────────────────────────────────

export interface BookCategory { id: string; name: string; }

export interface BookSummary {
  id: string; title: string; author: string | null;
  isbn: string | null; language: string;
  categoryName: string | null;
  totalCopies: number; availableCopies: number;
}

export interface BookCopy {
  id: string; bookId: string; copyNumber: string;
  accessionNumber: string | null; shelfLocation: string | null;
  condition: string; isAvailable: boolean;
  currentIssue?: { memberId: string; memberNumber: string; dueDate: { ad: string; bs: string } | null; isOverdue: boolean };
}

export interface BookDetail extends BookSummary {
  publisher: string | null; edition: string | null; description: string | null;
  copies: BookCopy[];
}

export interface LibraryMember {
  id: string; memberNumber: string;
  memberName: string; memberType: 'STUDENT' | 'STAFF';
  maxBooks: number; isActive: boolean;
  currentIssueCount: number;
}

export interface BookIssue {
  id: string; bookCopyId: string;
  bookTitle: string; copyNumber: string;
  memberId: string; memberNumber: string; memberName: string;
  issuedAt: { ad: string; bs: string };
  dueDate: { ad: string; bs: string };
  returnedAt: { ad: string; bs: string } | null;
  status: 'ISSUED' | 'RETURNED' | 'OVERDUE' | 'LOST';
  fineAmount: number; finePaid: boolean;
  overdueDays?: number;
}

export interface AddBookData {
  title: string; author?: string; publisher?: string;
  isbn?: string; categoryId?: string; edition?: string;
  language?: string; description?: string;
}

export interface AddCopyData {
  copyNumber: string; accessionNumber?: string;
  shelfLocation?: string; condition?: string;
}

export interface IssueBookData {
  bookCopyId: string; memberId: string;
  dueDate: string; finePerDay?: number; notes?: string;
}

// ── Communication Module ────────────────────────────────────────────────────

export interface Notice {
  id: string; title: string; body: string;
  type: string; audience: string; classId: string | null;
  isPublished: boolean; publishedAt: string | null;
  expiresAt: string | null; createdBy: string;
  createdAt: string;
}

export interface SmsLog {
  id: string; toNumber: string; message: string;
  trigger: string; status: 'PENDING' | 'SENT' | 'FAILED' | 'MOCK';
  sentAt: string | null; errorMessage: string | null;
  studentName: string | null;
}

export interface AppNotification {
  id: string; title: string; body: string;
  type: string; isRead: boolean; readAt: string | null;
  data: Record<string, unknown> | null; createdAt: string;
}

export interface CreateNoticeData {
  title: string; body: string;
  type?: string; audience?: string;
  classId?: string; expiresAt?: string;
}

// ── Super Admin Module ──────────────────────────────────────────────────────

export interface PlatformAdmin {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface PlatformOverview {
  asOf: { ad: string; bs: string };
  totals: {
    schools: number;
    activeSchools: number;
    trialSchools: number;
    suspendedSchools: number;
  };
  subscriptions: {
    trial: number;
    basic: number;
    pro: number;
    enterprise: number;
  };
  recentOnboarding: {
    id: string; name: string; slug: string;
    createdAt: string; planName: string;
  }[];
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  maxStudents: number;
  maxStaff: number;
  features: Record<string, boolean>;
  isActive: boolean;
}

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  isActive: boolean;
  createdAt: string;
  planName: string;
  subscriptionStatus: string;
  studentCount: number;
  staffCount: number;
}

export interface TenantDetail extends TenantSummary {
  email: string | null;
  phone: string | null;
  address: string | null;
  panNumber: string | null;
  primaryColor: string;
  description: string | null;
  establishedYear: number | null;
  website: string | null;
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
  planId: string;
}

export interface UpdateTenantData {
  schoolName?: string;
  logoUrl?: string;
  /** FILE-1: storage key from the presign flow — wins over logoUrl */
  logoFileKey?: string;
  primaryColor?: string;
  description?: string;
  establishedYear?: number;
  website?: string;
  address?: string;
  phone?: string;
  email?: string;
  panNumber?: string;
}

export interface ImpersonationToken {
  accessToken: string;
  tenantSlug: string;
  schoolName: string;
  warning: string;
}

// MAIL-1 resend: POST /super-admin/tenants/:id/resend-owner-credentials
export interface ResendOwnerCredentialsResult {
  userId: string;
  email: string;
  sent: boolean;
}

export interface AuditLog {
  id: string;
  adminEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface OnboardTenantData {
  schoolName: string;
  slug: string;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  // REG-OBS-5: omitted — the API generates the owner temp password + ledger delivery.
  adminPassword?: string;
  planId: string;
  phone?: string;
  address?: string;
  panNumber?: string;
  trialDays?: number;
}

export interface CreatePlanData {
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  maxStudents: number;
  maxStaff: number;
  features: Record<string, boolean>;
}

export interface RevenueData {
  month: string;
  planName: string;
  activeSchools: number;
  revenue: number;
}

export interface PlatformSettings {
  platformName: string;
  defaultTrialDays: number;
  smsSenderId: string;
  primaryColor: string;
}

// ── Settings Module ─────────────────────────────────────────────────────────

export interface SchoolProfile {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  /** BRAND-1: server-computed readable ink for primaryColor. */
  primaryForeground: string | null;
  description: string | null;
  motto: string | null;
  establishedYear: number | null;
  website: string | null;
  address: string | null;
  province: string | null;
  district: string | null;
  phone: string | null;
  alternatePhone: string | null;
  email: string | null;
  panNumber: string | null;
  registrationNumber: string | null;
  affiliationBoard: string | null;
  affiliationNumber: string | null;
  principalName: string | null;
  principalSignatureUrl: string | null;
  schoolStampUrl: string | null;
  /** UI-7 — curated print-accent set (common/tenant-brand-color.ts), distinct
   *  from primaryColor's free-form web branding. */
  brandColor: string | null;
  printLanguage: 'EN' | 'NE' | 'BOTH' | null;
  paymentInstructions: string | null;
  qrImageUrl: string | null;
}

export interface UpdateProfileData {
  name?: string;
  logoUrl?: string;
  primaryColor?: string;
  description?: string;
  motto?: string;
  establishedYear?: number;
  website?: string;
  address?: string;
  province?: string;
  district?: string;
  phone?: string;
  alternatePhone?: string;
  email?: string;
  panNumber?: string;
  registrationNumber?: string;
  affiliationBoard?: string;
  affiliationNumber?: string;
  principalName?: string;
  principalSignatureUrl?: string;
  schoolStampUrl?: string;
  /** FILE-1: storage keys from the presign flow — each wins over its *Url twin */
  logoFileKey?: string;
  principalSignatureFileKey?: string;
  schoolStampFileKey?: string;
  brandColor?: string;
  printLanguage?: 'EN' | 'NE' | 'BOTH';
  paymentInstructions?: string;
  qrImageUrl?: string;
  qrImageFileKey?: string;
}

// ── Dashboard Module ─────────────────────────────────────────────────────────

export interface DashboardOverview {
  asOf: { ad: string; bs: string };
  students: {
    total: number;
    active: number;
  };
  attendance: {
    date: { ad: string; bs: string };
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
  };
  fees: {
    fiscalYear: string;
    academicYearId: string;
    asOf: { ad: string; bs: string };
    totalInvoiced: number;
    totalCollected: number;
    totalPending: number;
    collectionRate: number;
  } | null;
  unreadNotifications: number;
}

export interface WeeklyAttendanceDay {
  date: { ad: string; bs: string };
  dayOfWeek: string;
  present: number;
  total: number;
  rate: number;
}

export interface WeeklyAttendance {
  weekStart: { ad: string; bs: string };
  weekEnd: { ad: string; bs: string };
  days: WeeklyAttendanceDay[];
}

export interface RecentStudent {
  id: string;
  name: string;
  admittedAt: { ad: string; bs: string };
}

export interface RecentPayment {
  id: string;
  studentName: string;
  amount: number;
  createdAt: { ad: string; bs: string };
}

export interface RecentNotice {
  id: string;
  title: string;
  publishedAt: { ad: string; bs: string } | null;
}

export interface RecentActivity {
  recentStudents: RecentStudent[];
  recentPayments: RecentPayment[];
  recentNotices: RecentNotice[];
}

export interface UpcomingExam {
  id: string;
  subjectName: string;
  className: string;
  examDate: { ad: string; bs: string };
  startTime: string;
  endTime: string;
}

export interface UpcomingEvents {
  exams: UpcomingExam[];
}

// ─── Online payments (PAY-1 eSewa) ───────────────────────────────────────────

/** Public, PII-free receipt shown on /payment/success + /payment/failure. */
export interface EsewaPublicReceipt {
  transactionUuid: string;
  status: 'INITIATED' | 'VERIFIED' | 'FAILED' | 'EXPIRED';
  amount: number;
  gateway: string;
  gatewayRef: string | null;
  invoiceNumber: string;
  failureReason: string | null;
  verifiedAt: string | null;
}


// ── EDU-1 Assignments ────────────────────────────────────────────────────────

export type AssignmentStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';
export type SubmissionStatus = 'SUBMITTED' | 'LATE' | 'REVIEWED';

export interface Assignment {
  id: string;
  academicYearId: string;
  classId: string;
  sectionId: string | null;
  subjectId: string;
  createdBy: string;
  title: string;
  description: string | null;
  dueDate: string;
  attachmentKeys: string[];
  status: AssignmentStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  className?: string;
  sectionName?: string | null;
  subjectName?: string;
  teacherName?: string;
  submissionCount?: number;
}

// WEB-P Phase 4 — GET /assignments/me response row. Extends Assignment with
// the caller's own submission summary (mirrors the MyExamSchedule extends
// ExamSchedule pattern above for /exams/schedules/my).
export interface MyAssignment extends Assignment {
  mySubmission: { status: SubmissionStatus; submittedAt: string; marks: number | null } | null;
}

// WEB-P Phase 5 — GET /assignments/my-children response shape (array
// elements, one per child; NOT one call per child — the backend returns
// every child's assignments in a single request, already guardian-scoped).
export interface MyChildAssignments {
  studentId: string;
  studentName: string;
  assignments: (Assignment & {
    submission: { status: SubmissionStatus; marks: number | null; feedback: string | null } | null;
  })[];
}

export interface AssignmentSubmission {
  id: string;
  assignmentId: string;
  studentId: string;
  textAnswer: string | null;
  fileKey: string | null;
  submittedAt: string;
  status: SubmissionStatus;
  marks: number | null;
  feedback: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  studentName?: string;
  rollNumber?: number | null;
}

export interface MissingStudent {
  studentId: string;
  studentName: string;
  rollNumber: number | null;
}

export interface AssignmentSubmissionsView {
  submissions: AssignmentSubmission[];
  missing: MissingStudent[];
}

export interface CreateAssignmentData {
  title: string;
  description?: string;
  classId: string;
  sectionId?: string;
  subjectId: string;
  academicYearId?: string;
  dueDate: string;
  attachmentKeys?: string[];
}

export interface UpdateAssignmentData {
  title?: string;
  description?: string;
  dueDate?: string;
  attachmentKeys?: string[];
}

export interface ReviewSubmissionData {
  marks?: number;
  feedback?: string;
}

// ── REP-1 Reports ────────────────────────────────────────────────────────────

export interface AttendanceTrendBucket {
  bucket: string;
  label: string;
  present: number;
  absent: number;
  late: number;
  leave: number;
  total: number;
  attendanceRate: number;
}

export interface AttendanceTrendsReport {
  from: string;
  to: string;
  groupBy: 'day' | 'bs-month';
  buckets: AttendanceTrendBucket[];
}

export interface SectionComparisonRow {
  sectionId: string;
  sectionName: string;
  present: number;
  absent: number;
  late: number;
  leave: number;
  total: number;
  attendanceRate: number;
}

export interface LowAttendanceStudent {
  studentId: string;
  studentName: string;
  rollNumber: number | null;
  className: string | null;
  sectionName: string | null;
  markedDays: number;
  attendanceRate: number;
}

export interface StaffAttendanceRow {
  userId: string;
  staffName: string;
  present: number;
  absent: number;
  late: number;
  leave: number;
  markedDays: number;
  attendanceRate: number;
}

export interface PublishedExam {
  id: string;
  name: string;
  academicYearId: string;
  publishedAt: string;
}

export interface ExamSubjectStat {
  subjectId: string;
  subjectName: string;
  appeared: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
  passRate: number;
}

export interface ExamSummaryReport {
  examTypeId: string;
  students: number;
  passRate: number;
  averagePercentage: number | null;
  subjects: ExamSubjectStat[];
  gradeDistribution: { grade: string; count: number }[];
}

export interface ExamComparisonRow {
  className: string | null;
  sectionName: string | null;
  students: number;
  passRate: number;
  averagePercentage: number | null;
}

export interface AgingBucketTotal {
  bucket: string;
  amount: number;
  invoices: number;
}

export interface AgingInvoiceRow {
  bucket: string;
  invoiceId: string;
  invoiceNumber: string;
  studentId: string;
  studentName: string;
  className: string | null;
  sectionName: string | null;
  dueDate: string;
  daysPastDue: number;
  balance: number;
}

export interface FeeAgingReport {
  asOf: string;
  buckets: AgingBucketTotal[];
  totalOutstanding: number;
  byClass: ({ className: string; total: number } & Record<string, number | string>)[];
  invoices: AgingInvoiceRow[];
}

// ─── UI-1: Fee Catalog ──────────────────────────────────────────────────────

export type FeeHeadRecurrence = 'MONTHLY' | 'QUARTERLY' | 'TERM' | 'ANNUAL' | 'ONE_TIME' | 'ON_DEMAND';
export type ProrationPolicy = 'NONE' | 'MONTHLY';

export interface FeeHead {
  id: string;
  name: string;
  code: string;
  recurrence: FeeHeadRecurrence;
  isTaxable: boolean;
  isRefundable: boolean;
  prorationPolicy: ProrationPolicy;
  glAccountCode: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
}
export interface CreateFeeHeadData {
  name: string;
  code: string;
  recurrence: FeeHeadRecurrence;
  isTaxable?: boolean;
  isRefundable?: boolean;
  prorationPolicy?: ProrationPolicy;
  glAccountCode?: string;
  displayOrder?: number;
}
export type UpdateFeeHeadData = Partial<CreateFeeHeadData> & { isActive?: boolean };

export interface DiscountReason {
  id: string;
  name: string;
  code: string;
  glAccountCode: string | null;
  isActive: boolean;
  createdAt: string;
}
export interface CreateDiscountReasonData { name: string; code: string; glAccountCode?: string }
export type UpdateDiscountReasonData = Partial<CreateDiscountReasonData> & { isActive?: boolean };

export interface CorrectionReason {
  id: string;
  name: string;
  code: string;
  glAccountCode: string | null;
  isActive: boolean;
  createdAt: string;
}
export interface CreateCorrectionReasonData { name: string; code: string; glAccountCode?: string }
export type UpdateCorrectionReasonData = Partial<CreateCorrectionReasonData> & { isActive?: boolean };

export interface TransportRoute {
  id: string;
  name: string;
  code: string;
  monthlyAmount: number;
  isActive: boolean;
  createdAt: string;
}
export interface CreateTransportRouteData { name: string; code: string; monthlyAmount: string }
export type UpdateTransportRouteData = Partial<CreateTransportRouteData> & { isActive?: boolean };

export type TaxAppliesTo = 'ALL' | 'TAXABLE_HEADS';
export interface TaxRate {
  id: string;
  name: string;
  rate: number;
  appliesTo: TaxAppliesTo;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdBy: string;
  createdAt: string;
}
export interface CreateTaxRateData {
  name: string;
  rate: number;
  appliesTo?: TaxAppliesTo;
  effectiveFrom: string;
  effectiveTo?: string;
}
export interface UpdateTaxRateData { name?: string; effectiveFrom?: string; effectiveTo?: string }

export type LateFeeRuleScope = 'GLOBAL' | 'FEE_HEAD';
export type LateFeeRuleType = 'FLAT' | 'PER_DAY' | 'PERCENT';
export interface LateFeeRule {
  id: string;
  scope: LateFeeRuleScope;
  feeHeadId: string | null;
  type: LateFeeRuleType;
  value: number;
  graceDays: number;
  capAmount: number | null;
  isEnabled: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
}
export interface CreateLateFeeRuleData {
  scope: LateFeeRuleScope;
  feeHeadId?: string;
  type: LateFeeRuleType;
  value: string;
  graceDays?: number;
  capAmount?: string;
  isEnabled?: boolean;
  effectiveFrom: string;
  effectiveTo?: string;
}
export interface UpdateLateFeeRuleData {
  value?: string;
  graceDays?: number;
  capAmount?: string;
  isEnabled?: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export interface BillFeeStructureItem {
  id: string;
  feeHeadId: string;
  feeHeadName?: string;
  amount: number;
  recurrenceOverride: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}
export interface BillFeeStructure {
  id: string;
  academicYearId: string;
  classId: string;
  sectionId: string | null;
  name: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  items?: BillFeeStructureItem[];
}
export interface BillFeeStructureItemInput {
  feeHeadId: string;
  amount: string;
  recurrenceOverride?: string;
  effectiveFrom: string;
  effectiveTo?: string;
}
export interface CreateBillFeeStructureData {
  academicYearId: string;
  classId: string;
  sectionId?: string;
  name: string;
  items: BillFeeStructureItemInput[];
}
export interface UpdateBillFeeStructureItemsData { items: BillFeeStructureItemInput[] }

// ── UI-2 — Assignment & concessions (BILL-2) ────────────────────────────────
// feeStructureId/transportRouteId are bare (no joined name) on the backend —
// resolved client-side against useFeeStructures()/useTransportRoutes(), per
// UI-2-SPEC.md §4.

export interface StudentFeeStructureAssignment {
  id: string;
  studentId: string;
  feeStructureId: string;
  academicYearId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  assignedBy: string;
  /** FEE-CLASS-GUARD: assigned across classes on purpose. */
  classMismatchOverridden: boolean;
  overriddenBy: string | null;
  overriddenAt: string | null;
  createdAt: string;
}
export interface AssignFeeStructureData {
  feeStructureId: string;
  effectiveFrom: string;
  /** FEE-CLASS-GUARD: send ONLY on an explicitly confirmed mismatch. */
  allowCrossClassAssignment?: boolean;
}

export interface StudentFeeOverride {
  id: string;
  studentId: string;
  feeHeadId: string;
  feeHeadName?: string;
  academicYearId: string;
  overrideAmount: number;
  reason: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdBy: string;
  createdAt: string;
}
export interface CreateStudentFeeOverrideData {
  studentId: string;
  feeHeadId: string;
  academicYearId: string;
  overrideAmount: string;
  reason?: string;
  effectiveFrom: string;
  effectiveTo?: string;
}
export interface UpdateStudentFeeOverrideData {
  overrideAmount?: string;
  reason?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export type ConcessionType = 'PERCENT' | 'AMOUNT';
export interface StudentConcession {
  id: string;
  studentId: string;
  feeHeadId: string | null;
  feeHeadName?: string;
  academicYearId: string;
  type: ConcessionType;
  value: number;
  capAmount: number | null;
  discountReasonId: string;
  discountReasonName?: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}
export interface CreateStudentConcessionData {
  studentId: string;
  feeHeadId?: string;
  academicYearId: string;
  type: ConcessionType;
  value: string;
  capAmount?: string;
  discountReasonId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  notes?: string;
}
export interface UpdateStudentConcessionData {
  type?: ConcessionType;
  value?: string;
  capAmount?: string;
  discountReasonId?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  notes?: string;
}

export interface StudentTransportAssignment {
  id: string;
  studentId: string;
  transportRouteId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  assignedBy: string;
  createdAt: string;
}
export interface CreateStudentTransportAssignmentData {
  studentId: string;
  transportRouteId: string;
  effectiveFrom: string;
  effectiveTo?: string;
}
export interface UpdateStudentTransportAssignmentData {
  transportRouteId?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export type BulkAssignScopeType = 'CLASS' | 'STUDENT_LIST';
export interface BulkAssignData {
  scopeType: BulkAssignScopeType;
  classId?: string;
  sectionId?: string;
  studentIds?: string[];
  effectiveFrom: string;
  /** FEE-CLASS-GUARD: applied uniformly to every student in the run. */
  allowCrossClassAssignment?: boolean;
}
export type BulkAssignJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type BulkAssignFailureReason = 'STUDENT_INVALID' | 'CLASS_MISMATCH';
/**
 * FEE-CLASS-GUARD: `reason` is OPTIONAL and absent on every failure row
 * written before this feature — `failures` is a jsonb column that was never
 * migrated. Consumers must fall back to rendering `error`.
 */
export interface BulkAssignFailure {
  studentId: string;
  error: string;
  reason?: BulkAssignFailureReason;
}
export interface BulkAssignJob {
  id: string;
  feeStructureId: string;
  academicYearId: string;
  scopeType: BulkAssignScopeType;
  scopeClassId: string | null;
  scopeSectionId: string | null;
  effectiveFrom: string;
  allowCrossClassAssignment: boolean;
  status: BulkAssignJobStatus;
  total: number;
  processed: number;
  failedCount: number;
  /**
   * BILL-8-UI: `GET /finance/jobs/:id` serves bulk-assign AND bill-print
   * jobs. Bill-print keys its failures by `invoiceId` and carries no
   * `reason`; both shapes are normalised in `lib/job-progress.ts`.
   */
  failures: (BulkAssignFailure | BillPrintFailure)[];
  /** BILL-8-UI: bill-print only, and only once COMPLETED. */
  downloadUrl?: string;
  createdBy: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface BillPrintFailure {
  invoiceId: string;
  error: string;
}

/** BILL-8-UI Phase 2 — `POST /finance/bill/print/class` body. */
export interface PrintClassData {
  classId: string;
  sectionId?: string;
  bsYear: number;
  bsMonth: number;
}

export interface FeePreviewConcessionLine {
  concessionId: string;
  discountReasonId: string;
  type: ConcessionType;
  amount: number;
}
export interface FeePreviewHeadLine {
  feeHeadId: string;
  feeHeadName: string;
  grossAmount: number;
  overrideAmount: number | null;
  effectiveBase: number;
  concessions: FeePreviewConcessionLine[];
  netAmount: number;
}
export interface FeePreview {
  studentId: string;
  feeStructureId: string;
  feeStructureName: string;
  /** FEE-CLASS-GUARD: the active assignment was a deliberate cross-class one. */
  classMismatchOverridden: boolean;
  academicYearId: string;
  asOfDate: string;
  heads: FeePreviewHeadLine[];
  transport: { transportRouteId: string; transportRouteName: string; amount: number } | null;
  wholeBillConcessions: FeePreviewConcessionLine[];
  grossTotal: number;
  concessionTotal: number;
  netTotal: number;
}

// ── UI-3 — Bill Runs (BILL-4) ───────────────────────────────────────────────

export type BillRunScope = 'CLASS' | 'WHOLE_SCHOOL';
export type BillRunStatus = 'DRAFT' | 'POSTING' | 'POSTED' | 'VOIDED';
export type BillRunLineOutcome =
  | 'DRAFT' | 'POSTED' | 'SKIPPED_NO_ASSIGNMENT' | 'SKIPPED_ALREADY_BILLED' | 'EXCLUDED' | 'FAILED';

export interface BillRunSummary {
  id: string;
  academicYearId: string;
  bsYear: number;
  bsMonth: number;
  scope: BillRunScope;
  classId: string | null;
  status: BillRunStatus;
  issueDate: string;
  dueDate: string;
  totalStudents: number;
  totalGross: number;
  totalConcession: number;
  totalTax: number;
  totalNet: number;
  createdBy: string;
  postedBy: string | null;
  postedAt: string | null;
  createdAt: string;
}
export type BillRunOutcomeSummary = Partial<Record<BillRunLineOutcome, number>>;
export interface BillRunLine {
  id: string;
  billRunId: string;
  studentId: string;
  studentName?: string;
  admissionNumber?: string;
  className?: string | null;
  sectionName?: string | null;
  outcome: BillRunLineOutcome;
  skipReason: string | null;
  billInvoiceId: string | null;
  gross: number;
  concession: number;
  tax: number;
  net: number;
  createdAt: string;
}
export interface BillRunDetail extends BillRunSummary {
  lines: BillRunLine[];
  outcomeSummary: BillRunOutcomeSummary;
}
export interface CreateBillRunData {
  academicYearId: string;
  scope: BillRunScope;
  classId?: string;
  bsYear: number;
  bsMonth: number;
  issueDate?: string;
  dueDate?: string;
}
export interface ExcludeBillRunLinesData {
  studentIds: string[];
}

// ── UI-4 — Payment Counter (BILL-5) ─────────────────────────────────────────

export interface BillInvoiceItem {
  id: string;
  feeHeadId: string | null;
  transportRouteId: string | null;
  itemName: string;
  recurrence: string | null;
  grossAmount: number;
  concessionAmount: number;
  isTaxable: boolean;
  netAmount: number;
  prorationNote: string | null;
  createdAt: string;
}
export interface BillInvoice {
  id: string;
  invoiceNumber: string | null;
  studentId: string;
  studentName?: string;
  admissionNumber?: string;
  className?: string;
  academicYearId: string;
  billRunId: string;
  bsYear: number;
  bsMonth: number;
  issueDate: string;
  dueDate: string;
  grossAmount: number;
  concessionAmount: number;
  taxableBase: number;
  taxRate: number | null;
  taxAmount: number;
  netAmount: number;
  previousBalance: number;
  totalReceivable: number;
  paidAmount: number;
  balance: number;
  amountInWordsEn: string | null;
  amountInWordsNe: string | null;
  status: 'POSTED' | 'SETTLED' | 'PARTIALLY_PAID' | 'VOIDED';
  ledgerEntryId: string | null;
  createdBy: string;
  createdAt: string;
  items?: BillInvoiceItem[];
}

export type BillPaymentMethod = 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'ESEWA' | 'KHALTI';
export type BillPaymentAllocationMode = 'AUTO_FIFO' | 'MANUAL' | 'ADVANCE_ONLY';
export type BillPaymentStatus = 'CLEARED' | 'PENDING' | 'BOUNCED' | 'VOIDED';

export interface BillPaymentAllocation {
  id: string;
  billInvoiceId: string;
  amount: number;
  createdAt: string;
}
export interface BillPayment {
  id: string;
  receiptNumber: string;
  studentId: string;
  studentName?: string;
  admissionNumber?: string;
  academicYearId: string;
  amount: number;
  method: BillPaymentMethod;
  status: BillPaymentStatus;
  receivedDate: string;
  receivedBs: { year: number; month: number; day: number } | null;
  reference: string | null;
  chequeBank: string | null;
  chequeDate: string | null;
  allocationMode: BillPaymentAllocationMode;
  ledgerEntryId: string | null;
  gatewayTxnRef: string | null;
  notes: string | null;
  receivedBy: string;
  createdAt: string;
  clearedAt: string | null;
  clearedBy: string | null;
  bouncedAt: string | null;
  bouncedBy: string | null;
  bounceReason: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  allocations?: BillPaymentAllocation[];
}

export interface ManualAllocationTarget {
  billInvoiceId: string;
  amount: string;
}
export interface CreateBillPaymentData {
  studentId: string;
  academicYearId: string;
  amount: string;
  method: BillPaymentMethod;
  allocationMode: BillPaymentAllocationMode;
  targets?: ManualAllocationTarget[];
  receivedDate?: string;
  reference?: string;
  notes?: string;
  chequeBank?: string;
  chequeDate?: string;
}
export interface UpdateChequeStatusData {
  status: 'CLEARED' | 'BOUNCED';
  reason?: string;
}
export interface VoidPaymentData {
  reason?: string;
}
export interface StudentBalance {
  studentId: string;
  balance: number;
  sign: 'OWES' | 'ADVANCE' | 'ZERO';
}

// ── UI-5 — Corrections (BILL-6) ─────────────────────────────────────────────

export type BillCorrectionType = 'CREDIT_NOTE' | 'REFUND' | 'WRITE_OFF';
export type BillCorrectionStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED';
export type RefundMethod = 'CASH' | 'BANK_TRANSFER';

export interface BillCorrection {
  id: string;
  correctionNumber: string;
  type: BillCorrectionType;
  studentId: string;
  studentName?: string;
  admissionNumber?: string;
  academicYearId: string;
  targetInvoiceId: string | null;
  targetInvoiceItemId: string | null;
  amount: number;
  reasonId: string;
  reasonName?: string | null;
  refundMethod: RefundMethod | null;
  refundReference: string | null;
  status: BillCorrectionStatus;
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  ledgerEntryId: string | null;
  requiresApproval: boolean;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  studentId: string;
  academicYearId: string;
  entryDate: string;
  entryBs: { year: number; month: number; day: number } | null;
  entryType: string;
  debit: number;
  credit: number;
  refDocType: string | null;
  refDocId: string | null;
  narration: string | null;
  reversesEntryId: string | null;
  createdBy: string;
  createdAt: string;
  runningBalance?: number;
}

export interface BillCorrectionDetail extends BillCorrection {
  ledgerEntries: LedgerEntry[];
}

export interface CreateCreditNoteData {
  studentId: string;
  academicYearId: string;
  targetInvoiceId: string;
  targetInvoiceItemId?: string;
  amount: string;
  reasonId: string;
}
export interface CreateRefundData {
  studentId: string;
  academicYearId: string;
  amount: string;
  reasonId: string;
  refundMethod: RefundMethod;
  refundReference?: string;
}
export interface CreateWriteOffData {
  studentId: string;
  academicYearId: string;
  targetInvoiceId?: string;
  amount: string;
  reasonId: string;
}
export interface DecideCorrectionData {
  note?: string;
}
// ── BILL-8-UI — print / PDF ─────────────────────────────────────────────────
/**
 * What every print endpoint returns. NOT a PDF body: a short-lived presigned
 * URL (300s) plus whether this call rendered it or served the cached
 * immutable artifact. Never cache or persist `presignedUrl` — see
 * `lib/print-document.ts`.
 */
export interface PrintDocumentResponse {
  presignedUrl: string;
  generated: boolean;
}

export interface FinanceSettings {
  invoiceNumberingReset: boolean;
  creditNoteApprovalThreshold: number;
}
export interface UpdateFinanceSettingsData {
  invoiceNumberingReset?: boolean;
  creditNoteApprovalThreshold?: string;
}

// ── UI-6 — Reports (BILL-9 suite + cashier close + concession register) ────

export interface DaybookEntry {
  id: string;
  time: string;
  entryType: string;
  studentId: string;
  studentName: string;
  admissionNumber: string;
  debit: number;
  credit: number;
  narration: string | null;
  invoiceNumber: string | null;
  paymentMethod: string | null;
  receiptNumber: string | null;
}
export interface DaybookReport {
  bsDate: { year: number; month: number; day: number };
  adDate: string;
  entries: DaybookEntry[];
  byMethod: { method: string; total: number }[];
  totals: { totalInvoiced: number; totalCollected: number; totalRefunded: number; netMovement: number };
}

export interface FinanceDefaulterStudent {
  studentId: string;
  admissionNumber: string;
  fullName: string;
  classId: string | null;
  className: string | null;
  sectionName: string | null;
  balance: number;
  overdueInvoices: number;
  oldestDueDate: string | null;
}
export interface FinanceDefaultersReport {
  asOf: string;
  totalDefaulters: number;
  totalOutstanding: number;
  students: FinanceDefaulterStudent[];
}

export interface CollectionSummaryBreakdownRow {
  key: string;
  label: string;
  total: number;
  count?: number;
}
export interface CollectionSummaryReport {
  range: { from: string; to: string };
  groupBy: 'method' | 'feehead';
  totalCollected: number;
  breakdown: CollectionSummaryBreakdownRow[];
}

export interface FineAccrual {
  id: string;
  accruedThrough: string;
  daysOverdue: number;
  amount: number;
  ruleType: string | null;
  ruleValue: number | null;
  reversed: boolean;
  invoiceId: string;
  invoiceNumber: string;
  studentId: string;
  admissionNumber: string;
  fullName: string;
  classId: string | null;
  className: string | null;
  sectionName: string | null;
}
export interface FinesReport {
  range: { from: string; to: string };
  count: number;
  totalFined: number;
  accruals: FineAccrual[];
}

export interface ConcessionRegisterEntry {
  concessionId: string;
  studentId: string;
  studentAdmissionNumber: string;
  studentName: string;
  className: string | null;
  feeHeadId: string | null;
  feeHeadName: string | null;
  type: ConcessionType;
  value: number;
  capAmount: number | null;
  discountReasonId: string;
  discountReasonName: string;
  appliedBy: string;
  appliedAt: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}
export interface StudentStatement {
  student: { id: string; admissionNumber: string; fullName: string; className: string | null };
  range: { from: string; to: string };
  openingBalance: number;
  closingBalance: number;
  advanceCredit: number;
  totalDebit: number;
  totalCredit: number;
  entries: LedgerEntry[];
}

export type CashierShiftStatus = 'OPEN' | 'CLOSED';
export interface CashierShift {
  id: string;
  cashierUserId: string;
  cashierName: string;
  academicYearId: string;
  openedAt: string;
  openedBs: { year: number; month: number; day: number } | null;
  openingFloat: number;
  closedAt: string | null;
  closedBy: string | null;
  closedByName: string | null;
  countedCash: number | null;
  expectedCash: number | null;
  variance: number | null;
  status: CashierShiftStatus;
  notes: string | null;
}
export interface OpenShiftData {
  academicYearId: string;
  openingFloat: string;
  notes?: string;
}
export interface CloseShiftData {
  countedCash: string;
  notes?: string;
}
export interface CashierCloseResult {
  shift: CashierShift;
  openingFloat: number;
  countedCash: number;
  expectedCash: number;
  variance: number;
  cashCollected: number;
  chequeTotal: number;
  gatewayTotal: number;
  byMethod: { method: string; total: number; count: number }[];
}

// ── CAL-1 — Calendar / holidays ─────────────────────────────────────────────
export type CalendarDaySource = 'GOVT' | 'SCHOOL';
export interface CalendarDay {
  id: string;
  date: { ad: string; bs: string };
  academicYearId: string | null;
  isHoliday: boolean;
  source: CalendarDaySource;
  labelEn: string;
  labelNe: string | null;
  createdBy: string | null;
  createdAt: string;
}
export interface CreateSchoolHolidayData {
  date: string;
  labelEn: string;
  labelNe?: string;
}
export interface UpdateSchoolHolidayData {
  date?: string;
  labelEn?: string;
  labelNe?: string;
}
