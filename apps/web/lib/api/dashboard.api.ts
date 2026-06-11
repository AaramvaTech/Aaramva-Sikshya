import api from '@/lib/api';
import type {
  ApiResponse,
  DashboardOverview,
  WeeklyAttendance,
  RecentActivity,
  UpcomingEvents,
} from '@/types/api.types';

export const dashboardApi = {
  getOverview: () =>
    api.get<ApiResponse<DashboardOverview>>('/dashboard/overview'),

  getWeeklyAttendance: () =>
    api.get<ApiResponse<WeeklyAttendance>>('/dashboard/weekly-attendance'),

  getRecentActivity: () =>
    api.get<ApiResponse<RecentActivity>>('/dashboard/activity'),

  getUpcomingEvents: () =>
    api.get<ApiResponse<UpcomingEvents>>('/dashboard/upcoming'),
};
