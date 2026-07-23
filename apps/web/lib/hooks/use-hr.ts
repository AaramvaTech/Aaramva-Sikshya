import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hrApi } from '@/lib/api/hr.api';
import { useTenantStore } from '@/store/tenant.store';
import type { CreateStaffData, ApplyLeaveData, PayrollOverride, StaffDocument } from '@/types/api.types';

export function useStaffList(params?: { page?: number; limit?: number; search?: string; departmentId?: string }) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['hr', 'staff', params],
    queryFn: () => hrApi.listStaff(params).then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useStaffDetail(id: string) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['hr', 'staff', id],
    queryFn: () => hrApi.getStaff(id).then((r) => r.data.data),
    enabled: !!slug && !!id,
  });
}

// WEB-P Phase 2 Task 1 — teacher's own staff/HR profile (GET /hr/staff/me).
export function useMyStaffProfile() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['hr', 'staff-me'],
    queryFn: () => hrApi.getMyProfile().then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useCreateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateStaffData) => hrApi.createStaff(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'staff'] });
    },
  });
}

export function useUpdateStaff(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreateStaffData>) => hrApi.updateStaff(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'staff', id] });
      queryClient.invalidateQueries({ queryKey: ['hr', 'staff'] });
    },
  });
}

// MAIL-1 resend: no cache invalidation — nothing displayed changes.
export function useResendStaffCredentials(id: string) {
  return useMutation({
    mutationFn: () => hrApi.resendStaffCredentials(id).then((r) => r.data.data),
  });
}

export function useStaffDocuments(id: string) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['hr', 'staff-documents', id],
    queryFn: () => hrApi.getStaffDocuments(id).then((r) => r.data.data),
    enabled: !!slug && !!id,
  });
}

export function useAddStaffDocument(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { documentType: string; fileUrl: string; fileName?: string }) =>
      hrApi.addStaffDocument(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'staff-documents', id] });
    },
  });
}

export function useDepartments() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['hr', 'departments'],
    queryFn: () => hrApi.listDepartments().then((r) => r.data.data.data),
    enabled: !!slug,
  });
}

export function useCreateDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string }) => hrApi.createDepartment(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['hr', 'departments'] }); },
  });
}

export function useUpdateDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string } }) =>
      hrApi.updateDepartment(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['hr', 'departments'] }); },
  });
}

export function useDeleteDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => hrApi.deleteDepartment(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['hr', 'departments'] }); },
  });
}

export function useDesignations() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['hr', 'designations'],
    queryFn: () => hrApi.listDesignations().then((r) => r.data.data.data),
    enabled: !!slug,
  });
}

export function useCreateDesignation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; departmentId?: string }) =>
      hrApi.createDesignation(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['hr', 'designations'] }); },
  });
}

export function useUpdateDesignation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { title: string; departmentId?: string } }) =>
      hrApi.updateDesignation(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['hr', 'designations'] }); },
  });
}

export function useDeleteDesignation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => hrApi.deleteDesignation(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['hr', 'designations'] }); },
  });
}

export function useEmploymentTypes() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['hr', 'employment-types'],
    queryFn: () => hrApi.listEmploymentTypes().then((r) => r.data.data.data),
    enabled: !!slug,
  });
}

export function useCreateEmploymentType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string }) => hrApi.createEmploymentType(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['hr', 'employment-types'] }); },
  });
}

export function useUpdateEmploymentType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string } }) =>
      hrApi.updateEmploymentType(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['hr', 'employment-types'] }); },
  });
}

export function useDeleteEmploymentType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => hrApi.deleteEmploymentType(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['hr', 'employment-types'] }); },
  });
}

export function useRoleLabels() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['hr', 'role-labels'],
    queryFn: () => hrApi.listRoleLabels().then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useUpdateRoleLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ role, label }: { role: string; label: string }) =>
      hrApi.updateRoleLabel(role, { label }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['hr', 'role-labels'] }); },
  });
}

export function useResetRoleLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (role: string) => hrApi.resetRoleLabel(role),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['hr', 'role-labels'] }); },
  });
}

export function useLeaveTypes() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['hr', 'leave-types'],
    queryFn: () => hrApi.listLeaveTypes().then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useCreateLeaveType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; daysPerYear: number; isPaid?: boolean }) =>
      hrApi.createLeaveType(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['hr', 'leave-types'] }); },
  });
}

export function useUpdateLeaveType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; daysPerYear?: number; isPaid?: boolean } }) =>
      hrApi.updateLeaveType(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['hr', 'leave-types'] }); },
  });
}

export function useDeleteLeaveType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => hrApi.deleteLeaveType(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['hr', 'leave-types'] }); },
  });
}

export function useLeaveRequests(params?: { page?: number; limit?: number; status?: string }) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['hr', 'leave', params],
    queryFn: () => hrApi.listLeave(params).then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useApplyLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ApplyLeaveData) => hrApi.applyLeave(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'leave'] });
    },
  });
}

export function useReviewLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { status: 'APPROVED' | 'REJECTED'; reviewerNote?: string } }) =>
      hrApi.reviewLeave(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'leave'] });
    },
  });
}

export function useLeaveBalance(userId: string) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['hr', 'leave-balance', userId],
    queryFn: () => hrApi.getLeaveBalance(userId).then((r) => r.data.data),
    enabled: !!slug && !!userId,
  });
}

// WEB-P Phase 3 Task 2 — teacher's own leave requests (GET /hr/leave/my).
// Distinct query key ('leave-my') from the admin useLeaveRequests's 'leave'
// key so the two never collide or invalidate each other.
export function useMyLeave(params?: { page?: number; limit?: number; status?: string }) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['hr', 'leave-my', params],
    queryFn: () => hrApi.getMyLeave(params).then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useCancelLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => hrApi.cancelLeave(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'leave-my'] });
    },
  });
}

// WEB-P Phase 3 Task 4 — teacher's own payroll slip history
// (GET /hr/payroll/staff/:userId/history). Distinct query key
// ('payroll-history') from the admin usePayrollSlips's ('payroll-slips',
// monthId) key — different route, different shape (all months for one
// staff member vs. one month for all staff), never invalidate one from
// the other.
export function useMyPayrollHistory(userId: string) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['hr', 'payroll-history', userId],
    queryFn: () => hrApi.getMyPayrollHistory(userId).then((r) => r.data.data),
    enabled: !!slug && !!userId,
  });
}

export function usePayrollMonths() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['hr', 'payroll-months'],
    // Paginated response: r.data.data = { data: [], meta: {} }
    queryFn: () => hrApi.listPayrollMonths().then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function usePayrollSlips(monthId: string) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['hr', 'payroll-slips', monthId],
    queryFn: () => hrApi.getPayrollSlips(monthId).then((r) => r.data.data),
    enabled: !!slug && !!monthId,
  });
}

export function useGeneratePayroll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ monthId, overrides }: { monthId: string; overrides?: PayrollOverride[] }) =>
      hrApi.generatePayroll(monthId, { overrides }),
    onSuccess: (_, { monthId }) => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'payroll-slips', monthId] });
    },
  });
}

export function useAdjustSlip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      monthId,
      slipId,
      data,
    }: {
      monthId: string;
      slipId: string;
      data: { allowances?: { name: string; amount: number }[]; deductions?: { name: string; amount: number }[]; unpaidLeaveDays?: number; notes?: string };
    }) => hrApi.adjustSlip(monthId, slipId, data),
    onSuccess: (_, { monthId }) => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'payroll-slips', monthId] });
    },
  });
}

export function useDeletePayrollMonth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (monthId: string) => hrApi.deletePayrollMonth(monthId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'payroll-months'] });
    },
  });
}

export function useFinalizePayroll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (monthId: string) => hrApi.finalizePayroll(monthId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'payroll-months'] });
    },
  });
}

export function useOpenPayrollMonth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { monthBs: number; yearBs: number; academicYearId: string }) =>
      hrApi.openPayrollMonth(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'payroll-months'] });
    },
  });
}
