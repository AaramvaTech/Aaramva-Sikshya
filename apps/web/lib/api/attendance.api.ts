import api from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  AttendanceRecord,
  BulkAttendanceData,
  StudentAttendanceSummary,
  SectionAttendanceReport,
  SchoolAttendanceSummary,
  StudentLeaveRequest,
  ReviewLeaveData,
} from '@/types/api.types';

export const attendanceApi = {
  bulkMark: (data: BulkAttendanceData) =>
    api.post<ApiResponse<{ count: number }>>('/attendance/students/bulk', data),

  getSectionAttendance: (params: {
    sectionId: string;
    date: string;
    academicYearId?: string;
  }) =>
    api.get<ApiResponse<PaginatedResponse<AttendanceRecord>>>('/attendance/students', {
      params,
    }),

  getStudentSummary: (studentId: string, academicYearId?: string) =>
    api.get<ApiResponse<StudentAttendanceSummary>>(
      `/attendance/students/${studentId}/summary`,
      { params: academicYearId ? { academicYearId } : undefined },
    ),

  getSectionReport: (
    sectionId: string,
    params: { fromDate: string; toDate: string; academicYearId?: string },
  ) =>
    api.get<ApiResponse<SectionAttendanceReport>>(
      `/attendance/students/section/${sectionId}/report`,
      { params },
    ),

  getSchoolSummary: () =>
    api.get<ApiResponse<SchoolAttendanceSummary>>('/attendance/students/school/summary'),

  // ── Student leave requests (review loop) ──────────────────────────────────
  listLeaveRequests: (params: { status?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<StudentLeaveRequest>>>('/attendance/leave', {
      params,
    }),

  reviewLeave: (id: string, data: ReviewLeaveData) =>
    api.patch<ApiResponse<StudentLeaveRequest>>(`/attendance/leave/${id}/review`, data),
};
