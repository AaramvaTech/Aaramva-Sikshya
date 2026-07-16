import api, { rawApi } from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  PlatformAdmin,
  PlatformOverview,
  SubscriptionPlan,
  TenantSummary,
  TenantDetail,
  ImpersonationToken,
  AuditLog,
  OnboardTenantData,
  UpdateTenantData,
  CreatePlanData,
  RevenueData,
} from '@/types/api.types';

export const superAdminApi = {
  // Auth
  login: (data: { email: string; password: string }) =>
    api.post<ApiResponse<{ accessToken: string; admin: PlatformAdmin }>>(
      '/super-admin/auth/login',
      data,
    ),
  // Platform session restore/rotate. rawApi is interceptor-free (mirrors the school
  // refresh) so a 401 here can never recurse into the refresh flow. The input is the
  // httpOnly platform_refresh_token cookie — rawApi already sends credentials.
  refresh: () =>
    rawApi.post<ApiResponse<{ accessToken: string; admin: PlatformAdmin }>>(
      '/super-admin/auth/refresh',
      {},
    ),
  logout: () => api.post('/super-admin/auth/logout'),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.post<ApiResponse<{ changed: boolean }>>('/super-admin/auth/change-password', data),

  // Analytics
  getOverview: () =>
    api.get<ApiResponse<PlatformOverview>>('/super-admin/analytics/overview'),
  getRevenue: () =>
    api.get<ApiResponse<RevenueData[]>>('/super-admin/analytics/revenue'),

  // Plans
  listPlans: () =>
    api.get<ApiResponse<SubscriptionPlan[]>>('/super-admin/plans'),
  createPlan: (data: CreatePlanData) =>
    api.post<ApiResponse<SubscriptionPlan>>('/super-admin/plans', data),
  updatePlan: (id: string, data: Partial<CreatePlanData>) =>
    api.patch<ApiResponse<SubscriptionPlan>>(`/super-admin/plans/${id}`, data),
  deactivatePlan: (id: string) => api.delete(`/super-admin/plans/${id}`),

  // Tenants
  listTenants: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: 'active' | 'suspended';
    planId?: string;
  }) =>
    api.get<ApiResponse<PaginatedResponse<TenantSummary>>>('/super-admin/tenants', { params }),
  getTenant: (id: string) =>
    api.get<ApiResponse<TenantDetail>>(`/super-admin/tenants/${id}`),
  onboardTenant: (data: OnboardTenantData) =>
    api.post<ApiResponse<TenantDetail>>('/super-admin/tenants', data),
  updateTenant: (id: string, data: UpdateTenantData) =>
    api.patch<ApiResponse<TenantDetail>>(`/super-admin/tenants/${id}`, data),
  suspendTenant: (id: string) =>
    api.patch(`/super-admin/tenants/${id}/suspend`, {}),
  activateTenant: (id: string) =>
    api.patch(`/super-admin/tenants/${id}/activate`, {}),

  // Subscription
  updateSubscription: (
    tenantId: string,
    data: { planId?: string; status?: string; endsAt?: string },
  ) => api.patch(`/super-admin/tenants/${tenantId}/subscription`, data),

  // Impersonation
  impersonate: (tenantId: string) =>
    api.post<ApiResponse<ImpersonationToken>>(
      `/super-admin/tenants/${tenantId}/impersonate`,
      {},
    ),

  // Audit logs
  getAuditLogs: (params?: { page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<AuditLog>>>('/super-admin/audit-logs', { params }),

  // Platform settings
  getPlatformSettings: () =>
    api.get<ApiResponse<import('@/types/api.types').PlatformSettings>>('/super-admin/settings'),
  updatePlatformSettings: (data: Partial<import('@/types/api.types').PlatformSettings>) =>
    api.patch<ApiResponse<import('@/types/api.types').PlatformSettings>>('/super-admin/settings', data),
};
