import api from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  MyAttendanceSummary,
  MyAttendanceHistoryItem,
  MyTodayTimetable,
  StudentMeProfile,
  ReportCard,
} from '@/types/api.types';

// WEB-P Phase 4 — every /students/me/* call. Same discipline as the backend:
// the student is always resolved from the caller's JWT server-side; nothing
// here accepts or forwards a studentId.
export const studentApi = {
  getMyProfile: () => api.get<ApiResponse<StudentMeProfile>>('/students/me'),
  getMyTodayTimetable: () =>
    api.get<ApiResponse<MyTodayTimetable>>('/students/me/timetable/today'),
  getMyAttendanceSummary: (params?: { academicYearId?: string }) =>
    api.get<ApiResponse<MyAttendanceSummary>>('/students/me/attendance/summary', { params }),
  getMyAttendanceHistory: (params: { fromDate?: string; toDate?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<MyAttendanceHistoryItem>>>('/students/me/attendance/history', { params }),
  getMyReportCard: () => api.get<ApiResponse<ReportCard>>('/students/me/report-card'),
  // Generated on the fly per-request (buildReportCardPdf) — NOT a FILE-1
  // stored object, so there is no presigned-URL step here; this is a direct
  // authenticated blob fetch, unlike every other file download in this app.
  downloadMyReportCardPdf: () =>
    api.get('/students/me/report-card/pdf', { responseType: 'blob' }),
};
