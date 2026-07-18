import api from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  StaffSummary,
  StaffDetail,
  StaffDocument,
  ResendStaffCredentialsResult,
  Department,
  Designation,
  EmploymentType,
  RoleLabel,
  LeaveType,
  LeaveRequest,
  LeaveBalance,
  PayrollMonth,
  SalarySlip,
  CreateStaffData,
  ApplyLeaveData,
  PayrollOverride,
} from '@/types/api.types';

// Departments and designations use paginated response shape from the backend

export const hrApi = {
  listStaff: (params?: { page?: number; limit?: number; search?: string; departmentId?: string; role?: string }) =>
    api.get<ApiResponse<PaginatedResponse<StaffSummary>>>('/hr/staff', { params }),
  getStaff: (id: string) =>
    api.get<ApiResponse<StaffDetail>>(`/hr/staff/${id}`),
  createStaff: (data: CreateStaffData) =>
    api.post<ApiResponse<StaffDetail>>('/hr/staff', data),
  updateStaff: (id: string, data: Partial<CreateStaffData>) =>
    api.patch<ApiResponse<StaffDetail>>(`/hr/staff/${id}`, data),
  deleteStaff: (id: string) => api.delete(`/hr/staff/${id}`),
  // MAIL-1 resend: regenerates the staff member's temp password, revokes
  // their sessions, and emails the new credentials. Throttled 5/h server-side.
  resendStaffCredentials: (id: string) =>
    api.post<ApiResponse<ResendStaffCredentialsResult>>(`/hr/staff/${id}/resend-credentials`, {}),
  getStaffDocuments: (id: string) =>
    api.get<ApiResponse<StaffDocument[]>>(`/hr/staff/${id}/documents`),
  addStaffDocument: (id: string, data: { documentType: string; fileUrl?: string; fileKey?: string; fileName?: string }) =>
    api.post<ApiResponse<StaffDocument>>(`/hr/staff/${id}/documents`, data),

  listDepartments: () => api.get<ApiResponse<PaginatedResponse<Department>>>('/hr/departments'),
  createDepartment: (data: { name: string }) =>
    api.post<ApiResponse<Department>>('/hr/departments', data),
  updateDepartment: (id: string, data: { name: string }) =>
    api.patch<ApiResponse<Department>>(`/hr/departments/${id}`, data),
  deleteDepartment: (id: string) => api.delete(`/hr/departments/${id}`),

  listDesignations: () => api.get<ApiResponse<PaginatedResponse<Designation>>>('/hr/designations'),
  createDesignation: (data: { title: string; departmentId?: string }) =>
    api.post<ApiResponse<Designation>>('/hr/designations', data),
  updateDesignation: (id: string, data: { title: string; departmentId?: string }) =>
    api.patch<ApiResponse<Designation>>(`/hr/designations/${id}`, data),
  deleteDesignation: (id: string) => api.delete(`/hr/designations/${id}`),

  listEmploymentTypes: () => api.get<ApiResponse<PaginatedResponse<EmploymentType>>>('/hr/employment-types'),
  createEmploymentType: (data: { name: string }) =>
    api.post<ApiResponse<EmploymentType>>('/hr/employment-types', data),
  updateEmploymentType: (id: string, data: { name: string }) =>
    api.patch<ApiResponse<EmploymentType>>(`/hr/employment-types/${id}`, data),
  deleteEmploymentType: (id: string) => api.delete(`/hr/employment-types/${id}`),

  listRoleLabels: () => api.get<ApiResponse<RoleLabel[]>>('/hr/role-labels'),
  updateRoleLabel: (role: string, data: { label: string }) =>
    api.put<ApiResponse<RoleLabel>>(`/hr/role-labels/${role}`, data),
  resetRoleLabel: (role: string) => api.delete<ApiResponse<RoleLabel>>(`/hr/role-labels/${role}`),

  listLeaveTypes: () => api.get<ApiResponse<LeaveType[]>>('/hr/leave-types'),
  createLeaveType: (data: { name: string; daysPerYear: number; isPaid?: boolean }) =>
    api.post<ApiResponse<LeaveType>>('/hr/leave-types', data),
  updateLeaveType: (id: string, data: { name?: string; daysPerYear?: number; isPaid?: boolean }) =>
    api.patch<ApiResponse<LeaveType>>(`/hr/leave-types/${id}`, data),
  deleteLeaveType: (id: string) => api.delete(`/hr/leave-types/${id}`),

  listLeave: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get<ApiResponse<PaginatedResponse<LeaveRequest>>>('/hr/leave', { params }),
  applyLeave: (data: ApplyLeaveData) =>
    api.post<ApiResponse<LeaveRequest>>('/hr/leave', data),
  reviewLeave: (id: string, data: { status: 'APPROVED' | 'REJECTED'; reviewerNote?: string }) =>
    api.patch<ApiResponse<LeaveRequest>>(`/hr/leave/${id}/review`, data),
  getLeaveBalance: (userId: string) =>
    api.get<ApiResponse<LeaveBalance[]>>(`/hr/leave/balance/${userId}`),

  listPayrollMonths: () =>
    api.get<ApiResponse<{ data: PayrollMonth[]; meta: { page: number; limit: number; total: number } }>>('/hr/payroll/months'),
  getPayrollSlips: (monthId: string) =>
    api.get<ApiResponse<SalarySlip[]>>(`/hr/payroll/months/${monthId}/slips`),
  generatePayroll: (monthId: string, data?: { overrides?: PayrollOverride[] }) =>
    api.post<ApiResponse<SalarySlip[]>>(`/hr/payroll/months/${monthId}/generate`, data ?? {}),
  adjustSlip: (monthId: string, slipId: string, data: { allowances?: { name: string; amount: number }[]; deductions?: { name: string; amount: number }[]; unpaidLeaveDays?: number; notes?: string }) =>
    api.patch<ApiResponse<SalarySlip>>(`/hr/payroll/months/${monthId}/slips/${slipId}`, data),
  deletePayrollMonth: (monthId: string) =>
    api.delete<ApiResponse<null>>(`/hr/payroll/months/${monthId}`),
  finalizePayroll: (monthId: string) =>
    api.patch<ApiResponse<PayrollMonth>>(`/hr/payroll/months/${monthId}/finalize`),
  openPayrollMonth: (data: { monthBs: number; yearBs: number; academicYearId: string }) =>
    api.post<ApiResponse<PayrollMonth>>('/hr/payroll/months', data),
};
