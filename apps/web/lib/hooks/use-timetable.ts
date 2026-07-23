import { useQuery } from '@tanstack/react-query';
import { timetableApi } from '@/lib/api/timetable.api';
import { useTenantStore } from '@/store/tenant.store';

// WEB-P Phase 2 Task 1 — shared with the Task 2/3 attendance + marks grids.

export function useMySections() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['timetable', 'my-sections'],
    queryFn: () => timetableApi.getMySections().then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useMyTimetable() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['timetable', 'my'],
    queryFn: () => timetableApi.getMyTimetable().then((r) => r.data.data),
    enabled: !!slug,
  });
}
