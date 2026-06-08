import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hrApi } from '@/lib/api/hr.api';
import { useTenantStore } from '@/store/tenant.store';
import type { CreateStaffData, ApplyLeaveData, PayrollOverride } from '@/types/api.types';

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

export function useCreateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateStaffData) => hrApi.createStaff(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'staff'] });
    },
  });
}

export function useDepartments() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['hr', 'departments'],
    queryFn: () => hrApi.listDepartments().then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useDesignations() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['hr', 'designations'],
    queryFn: () => hrApi.listDesignations().then((r) => r.data.data),
    enabled: !!slug,
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

export function usePayrollMonths() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['hr', 'payroll-months'],
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'payroll-slips'] });
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
