import { useQuery } from '@tanstack/react-query';
import { studentApi } from '@/lib/api/student.api';
import { useTenantStore } from '@/store/tenant.store';

export function useStudentMeProfile() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['students', 'me'],
    queryFn: () => studentApi.getMyProfile().then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useMyTodayTimetable() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['students', 'me', 'timetable-today'],
    queryFn: () => studentApi.getMyTodayTimetable().then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useMyAttendanceSummary() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['students', 'me', 'attendance-summary'],
    queryFn: () => studentApi.getMyAttendanceSummary().then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useMyAttendanceHistory(params: { fromDate: string; toDate: string }) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['students', 'me', 'attendance-history', params],
    queryFn: () =>
      studentApi
        .getMyAttendanceHistory({ ...params, limit: 100 })
        .then((r) => r.data.data.data),
    enabled: !!slug && !!params.fromDate && !!params.toDate,
  });
}

export function useMyResults() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['students', 'me', 'results'],
    queryFn: () => studentApi.getMyResults().then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useMyReportCard() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['students', 'me', 'report-card'],
    queryFn: () => studentApi.getMyReportCard().then((r) => r.data.data),
    enabled: !!slug,
  });
}
