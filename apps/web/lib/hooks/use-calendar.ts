import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/tenant.store';
import { calendarApi } from '@/lib/api/calendar.api';
import type { CreateSchoolHolidayData, UpdateSchoolHolidayData } from '@/types/api.types';

export function useCalendarHolidays(params?: { fromDate?: string; toDate?: string }) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['calendar', 'holidays', params],
    queryFn: () => calendarApi.list({ ...params, limit: 200 }).then((r) => r.data.data.data),
    enabled: !!slug,
  });
}

export function useCreateSchoolHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSchoolHolidayData) => calendarApi.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendar', 'holidays'] }),
  });
}

export function useUpdateSchoolHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSchoolHolidayData }) =>
      calendarApi.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendar', 'holidays'] }),
  });
}

export function useDeleteSchoolHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => calendarApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendar', 'holidays'] }),
  });
}
