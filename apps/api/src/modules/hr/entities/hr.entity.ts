import { adToBs } from 'bs-calendar';

// ─── Row shapes ───────────────────────────────────────────────────────────────

export interface DepartmentRow {
  id: string;
  name: string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
  designation_count?: string;
}

export interface DesignationRow {
  id: string;
  title: string;
  department_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
  department_name?: string | null;
}

export interface EmploymentTypeRow {
  id: string;
  name: string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
  staff_count?: string;
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  role: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
}

export interface StaffProfileRow {
  id: string;
  user_id: string;
  employee_id: string;
  department_id: string | null;
  designation_id: string | null;
  date_of_birth: Date | string | null;
  gender: string | null;
  nationality: string | null;
  phone: string | null;
  permanent_address: string | null;
  temporary_address: string | null;
  join_date: Date | string;
  end_date: Date | string | null;
  employment_type: string;
  base_salary: string | number;
  pan_number: string | null;
  bank_name: string | null;
  bank_account: string | null;
  photo_url: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
  // joined
  email?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  is_active?: boolean;
  department_name?: string | null;
  designation_title?: string | null;
}

export interface LeaveTypeRow {
  id: string;
  name: string;
  days_per_year: number;
  is_paid: boolean;
  created_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface StaffLeaveRequestRow {
  id: string;
  user_id: string;
  leave_type_id: string;
  from_date: Date | string;
  to_date: Date | string;
  total_days: number;
  reason: string | null;
  status: string;
  applied_at: Date | string;
  reviewed_by: string | null;
  reviewed_at: Date | string | null;
  reviewer_note: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
  leave_type_name?: string;
  staff_name?: string;
}

export interface PayrollMonthRow {
  id: string;
  month_bs: number;
  year_bs: number;
  academic_year_id: string;
  status: string;
  finalized_at: Date | string | null;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
  total_count?: string;
}

export interface SalarySlipRow {
  id: string;
  payroll_month_id: string;
  user_id: string;
  staff_profile_id: string;
  base_salary: string | number;
  allowance_total: string | number;
  allowances: unknown;
  deduction_total: string | number;
  deductions: unknown;
  unpaid_leave_days: number;
  leave_deduction: string | number;
  gross_salary: string | number;
  net_salary: string | number;
  payment_date: Date | string | null;
  payment_method: string | null;
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  total_count?: string;
  // joined
  first_name?: string;
  last_name?: string;
  employee_id?: string;
}

export interface StaffDocumentRow {
  id: string;
  user_id: string;
  document_type: string;
  file_url: string;
  file_name: string | null;
  uploaded_at: Date | string;
  deleted_at: Date | string | null;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export interface BsAdDate { ad: string; bs: string; }

export interface DepartmentResponseDto {
  id: string;
  name: string;
  designationCount: number;
  createdAt: string;
}

export interface DesignationResponseDto {
  id: string;
  title: string;
  departmentId: string | null;
  departmentName: string | null;
  createdAt: string;
}

export interface EmploymentTypeResponseDto {
  id: string;
  name: string;
  staffCount: number;
  createdAt: string;
}

export interface StaffResponseDto {
  id: string;
  userId: string;
  employeeId: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  departmentId: string | null;
  departmentName: string | null;
  designationId: string | null;
  designationTitle: string | null;
  dateOfBirth: BsAdDate | null;
  gender: string | null;
  phone: string | null;
  joinDate: BsAdDate;
  endDate: BsAdDate | null;
  employmentType: string;
  baseSalary: number;
  panNumber: string | null;
  bankName: string | null;
  bankAccount: string | null;
  photoUrl: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  createdAt: string;
}

export interface LeaveTypeResponseDto {
  id: string;
  name: string;
  daysPerYear: number;
  isPaid: boolean;
  createdAt: string;
}

export interface LeaveRequestResponseDto {
  id: string;
  userId: string;
  staffName: string;
  leaveTypeId: string;
  leaveTypeName: string | undefined;
  fromDate: BsAdDate;
  toDate: BsAdDate;
  totalDays: number;
  reason: string | null;
  status: string;
  appliedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewerNote: string | null;
}

export interface LeaveBalanceDto {
  leaveTypeId: string;
  leaveTypeName: string;
  entitlement: number;
  used: number;
  balance: number;
}

export interface PayrollMonthResponseDto {
  id: string;
  monthBs: number;
  yearBs: number;
  academicYearId: string;
  status: string;
  finalizedAt: string | null;
  createdBy: string;
  createdAt: string;
}

export interface SalarySlipResponseDto {
  id: string;
  payrollMonthId: string;
  userId: string;
  staffProfileId: string;
  employeeId: string | undefined;
  staffName: string;
  baseSalary: number;
  allowanceTotal: number;
  allowances: unknown;
  deductionTotal: number;
  deductions: unknown;
  unpaidLeaveDays: number;
  leaveDeduction: number;
  grossSalary: number;
  netSalary: number;
  paymentDate: BsAdDate | null;
  paymentMethod: string | null;
  notes: string | null;
  createdAt: string;
}

export interface StaffDocumentResponseDto {
  id: string;
  userId: string;
  documentType: string;
  fileUrl: string;
  fileName: string | null;
  uploadedAt: string;
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

export function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : parseFloat(v);
}

function toIsoString(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function toDepartmentResponse(row: DepartmentRow): DepartmentResponseDto {
  return {
    id: row.id,
    name: row.name,
    designationCount: row.designation_count ? parseInt(row.designation_count, 10) : 0,
    createdAt: toIsoString(row.created_at),
  };
}

export function toDesignationResponse(row: DesignationRow): DesignationResponseDto {
  return {
    id: row.id,
    title: row.title,
    departmentId: row.department_id,
    departmentName: row.department_name ?? null,
    createdAt: toIsoString(row.created_at),
  };
}

export function toEmploymentTypeResponse(row: EmploymentTypeRow): EmploymentTypeResponseDto {
  return {
    id: row.id,
    name: row.name,
    staffCount: row.staff_count ? parseInt(row.staff_count, 10) : 0,
    createdAt: toIsoString(row.created_at),
  };
}

export function toStaffResponse(row: StaffProfileRow): StaffResponseDto {
  return {
    id: row.id,
    userId: row.user_id,
    employeeId: row.employee_id,
    fullName: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
    email: row.email ?? '',
    role: row.role ?? '',
    isActive: row.is_active ?? true,
    departmentId: row.department_id,
    departmentName: row.department_name ?? null,
    designationId: row.designation_id,
    designationTitle: row.designation_title ?? null,
    dateOfBirth: row.date_of_birth ? toDateField(row.date_of_birth) : null,
    gender: row.gender,
    phone: row.phone,
    joinDate: toDateField(row.join_date),
    endDate: row.end_date ? toDateField(row.end_date) : null,
    employmentType: row.employment_type,
    baseSalary: toNum(row.base_salary),
    panNumber: row.pan_number,
    bankName: row.bank_name,
    bankAccount: row.bank_account,
    photoUrl: row.photo_url,
    emergencyContactName: row.emergency_contact_name,
    emergencyContactPhone: row.emergency_contact_phone,
    createdAt: toIsoString(row.created_at),
  };
}

export function toLeaveTypeResponse(row: LeaveTypeRow): LeaveTypeResponseDto {
  return {
    id: row.id,
    name: row.name,
    daysPerYear: row.days_per_year,
    isPaid: row.is_paid,
    createdAt: toIsoString(row.created_at),
  };
}

export function toLeaveRequestResponse(row: StaffLeaveRequestRow): LeaveRequestResponseDto {
  return {
    id: row.id,
    userId: row.user_id,
    staffName: row.staff_name ?? '',
    leaveTypeId: row.leave_type_id,
    leaveTypeName: row.leave_type_name,
    fromDate: toDateField(row.from_date),
    toDate: toDateField(row.to_date),
    totalDays: row.total_days,
    reason: row.reason,
    status: row.status,
    appliedAt: toIsoString(row.applied_at),
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at ? toIsoString(row.reviewed_at) : null,
    reviewerNote: row.reviewer_note,
  };
}

export function toPayrollMonthResponse(row: PayrollMonthRow): PayrollMonthResponseDto {
  return {
    id: row.id,
    monthBs: row.month_bs,
    yearBs: row.year_bs,
    academicYearId: row.academic_year_id,
    status: row.status,
    finalizedAt: row.finalized_at ? toIsoString(row.finalized_at) : null,
    createdBy: row.created_by,
    createdAt: toIsoString(row.created_at),
  };
}

export function toSalarySlipResponse(row: SalarySlipRow): SalarySlipResponseDto {
  return {
    id: row.id,
    payrollMonthId: row.payroll_month_id,
    userId: row.user_id,
    staffProfileId: row.staff_profile_id,
    employeeId: row.employee_id,
    staffName: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
    baseSalary: toNum(row.base_salary),
    allowanceTotal: toNum(row.allowance_total),
    allowances: row.allowances,
    deductionTotal: toNum(row.deduction_total),
    deductions: row.deductions,
    unpaidLeaveDays: row.unpaid_leave_days,
    leaveDeduction: toNum(row.leave_deduction),
    grossSalary: toNum(row.gross_salary),
    netSalary: toNum(row.net_salary),
    paymentDate: row.payment_date ? toDateField(row.payment_date) : null,
    paymentMethod: row.payment_method,
    notes: row.notes,
    createdAt: toIsoString(row.created_at),
  };
}

export function toStaffDocumentResponse(row: StaffDocumentRow): StaffDocumentResponseDto {
  return {
    id: row.id,
    userId: row.user_id,
    documentType: row.document_type,
    fileUrl: row.file_url,
    fileName: row.file_name,
    uploadedAt: toIsoString(row.uploaded_at),
  };
}
