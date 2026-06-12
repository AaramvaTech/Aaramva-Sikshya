import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { superAdminApi } from '@/lib/api/super-admin.api';
import type { OnboardTenantData, UpdateTenantData, CreatePlanData, PlatformSettings } from '@/types/api.types';

export function usePlatformOverview() {
  return useQuery({
    queryKey: ['platform', 'overview'],
    queryFn: () => superAdminApi.getOverview().then((r) => r.data.data),
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useTenants(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'active' | 'suspended';
  planId?: string;
}) {
  return useQuery({
    queryKey: ['platform', 'tenants', params],
    queryFn: () => superAdminApi.listTenants(params).then((r) => r.data.data),
  });
}

export function useTenant(id: string) {
  return useQuery({
    queryKey: ['platform', 'tenant', id],
    queryFn: () => superAdminApi.getTenant(id).then((r) => r.data.data),
    enabled: !!id,
  });
}

export function useOnboardTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: OnboardTenantData) => superAdminApi.onboardTenant(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'tenants'] });
      queryClient.invalidateQueries({ queryKey: ['platform', 'overview'] });
    },
  });
}

export function useSuspendTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => superAdminApi.suspendTenant(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'tenants'] });
      queryClient.invalidateQueries({ queryKey: ['platform', 'overview'] });
    },
  });
}

export function useActivateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => superAdminApi.activateTenant(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'tenants'] });
      queryClient.invalidateQueries({ queryKey: ['platform', 'overview'] });
    },
  });
}

export function useImpersonate() {
  return useMutation({
    mutationFn: (tenantId: string) => superAdminApi.impersonate(tenantId),
  });
}

export function usePlans() {
  return useQuery({
    queryKey: ['platform', 'plans'],
    queryFn: () => superAdminApi.listPlans().then((r) => r.data.data),
  });
}

export function useCreatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePlanData) => superAdminApi.createPlan(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform', 'plans'] }),
  });
}

export function useUpdatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreatePlanData> }) =>
      superAdminApi.updatePlan(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform', 'plans'] }),
  });
}

export function useDeactivatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => superAdminApi.deactivatePlan(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform', 'plans'] }),
  });
}

export function useAuditLogs(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['platform', 'audit-logs', params],
    queryFn: () => superAdminApi.getAuditLogs(params).then((r) => r.data.data),
  });
}

export function useUpdateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTenantData }) =>
      superAdminApi.updateTenant(id, data),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'tenant', id] });
      queryClient.invalidateQueries({ queryKey: ['platform', 'tenants'] });
    },
  });
}

export function useUpdateSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      tenantId,
      data,
    }: {
      tenantId: string;
      data: { planId?: string; status?: string; endsAt?: string };
    }) => superAdminApi.updateSubscription(tenantId, data),
    onSuccess: (_data, { tenantId }) => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'tenant', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['platform', 'tenants'] });
    },
  });
}

export function usePlatformSettings() {
  return useQuery({
    queryKey: ['platform', 'settings'],
    queryFn: () => superAdminApi.getPlatformSettings().then((r) => r.data.data),
  });
}

export function useUpdatePlatformSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<PlatformSettings>) => superAdminApi.updatePlatformSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'settings'] });
    },
  });
}
