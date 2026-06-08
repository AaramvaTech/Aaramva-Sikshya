import api from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  StaffSummary,
  StaffDetail,
  Department,
  Designation,
  LeaveType,
  LeaveRequest,
  LeaveBalance,
  PayrollMonth,
  SalarySlip,
  CreateStaffData,
  ApplyLeaveData,
  PayrollOverride,
} from '@/types/api.types';

export const hrApi = {
  listStaff: (params?: { page?: number; limit?: number; search?: string; departmentId?: string }) =>
    api.get<ApiResponse<PaginatedResponse<StaffSummary>>>('/hr/staff', { params }),
  getStaff: (id: string) =>
    api.get<ApiResponse<StaffDetail>>(`/hr/staff/${id}`),
  createStaff: (data: CreateStaffData) =>
    api.post<ApiResponse<StaffDetail>>('/hr/staff', data),
  updateStaff: (id: string, data: Partial<CreateStaffData>) =>
    api.patch<ApiResponse<StaffDetail>>(`/hr/staff/${id}`, data),
  deleteStaff: (id: string) => api.delete(`/hr/staff/${id}`),

  listDepartments: () => api.get<ApiResponse<Department[]>>('/hr/departments'),
  createDepartment: (data: { name: string }) =>
    api.post<ApiResponse<Department>>('/hr/departments', data),

  listDesignations: () => api.get<ApiResponse<Designation[]>>('/hr/designations'),
  createDesignation: (data: { title: string; departmentId?: string }) =>
    api.post<ApiResponse<Designation>>('/hr/designations', data),

  listLeaveTypes: () => api.get<ApiResponse<LeaveType[]>>('/hr/leave-types'),

  listLeave: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get<ApiResponse<PaginatedResponse<LeaveRequest>>>('/hr/leave', { params }),
  applyLeave: (data: ApplyLeaveData) =>
    api.post<ApiResponse<LeaveRequest>>('/hr/leave', data),
  reviewLeave: (id: string, data: { status: 'APPROVED' | 'REJECTED'; reviewerNote?: string }) =>
    api.patch<ApiResponse<LeaveRequest>>(`/hr/leave/${id}/review`, data),
  getLeaveBalance: (userId: string) =>
    api.get<ApiResponse<LeaveBalance[]>>(`/hr/leave/balance/${userId}`),

  listPayrollMonths: () =>
    api.get<ApiResponse<PayrollMonth[]>>('/hr/payroll/months'),
  getPayrollSlips: (monthId: string) =>
    api.get<ApiResponse<SalarySlip[]>>(`/hr/payroll/months/${monthId}/slips`),
  generatePayroll: (monthId: string, data?: { overrides?: PayrollOverride[] }) =>
    api.post<ApiResponse<{ generated: number }>>(`/hr/payroll/months/${monthId}/generate`, data ?? {}),
  finalizePayroll: (monthId: string) =>
    api.patch<ApiResponse<PayrollMonth>>(`/hr/payroll/months/${monthId}/finalize`),
  openPayrollMonth: (data: { monthBs: number; yearBs: number; academicYearId: string }) =>
    api.post<ApiResponse<PayrollMonth>>('/hr/payroll/months', data),
};
