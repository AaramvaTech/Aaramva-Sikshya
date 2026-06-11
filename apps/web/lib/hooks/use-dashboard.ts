import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/api/dashboard.api';
import { useTenantStore } from '@/store/tenant.store';

export function useDashboardOverview() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: () => dashboardApi.getOverview().then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useWeeklyAttendance() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['dashboard', 'weekly-attendance'],
    queryFn: () => dashboardApi.getWeeklyAttendance().then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useRecentActivity() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['dashboard', 'activity'],
    queryFn: () => dashboardApi.getRecentActivity().then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useUpcomingEvents() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['dashboard', 'upcoming'],
    queryFn: () => dashboardApi.getUpcomingEvents().then((r) => r.data.data),
    enabled: !!slug,
  });
}
