import api from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  CalendarDay,
  CreateSchoolHolidayData,
  UpdateSchoolHolidayData,
} from '@/types/api.types';

export const calendarApi = {
  list: (params?: { fromDate?: string; toDate?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<CalendarDay>>>('/calendar/holidays', { params }),
  create: (data: CreateSchoolHolidayData) =>
    api.post<ApiResponse<CalendarDay>>('/calendar/holidays', data),
  update: (id: string, data: UpdateSchoolHolidayData) =>
    api.patch<ApiResponse<CalendarDay>>(`/calendar/holidays/${id}`, data),
  remove: (id: string) => api.delete(`/calendar/holidays/${id}`),
};
