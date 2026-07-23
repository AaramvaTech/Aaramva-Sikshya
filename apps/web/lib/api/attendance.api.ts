import api from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  AttendanceRecord,
  BulkAttendanceData,
  StudentAttendanceSummary,
  SectionAttendanceReport,
  SchoolAttendanceSummary,
  StaffAttendanceSummary,
  StudentLeaveRequest,
  ReviewLeaveData,
  ApplyChildLeaveData,
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

  // WEB-P Phase 2 Task 1 — self-scoped (GET /attendance/staff/my/summary,
  // TEACHER_AND_ABOVE); year/month are AD and required by the backend
  // (Postgres EXTRACT on the stored date, no default).
  getMyStaffSummary: (params: { year: number; month: number }) =>
    api.get<ApiResponse<StaffAttendanceSummary>>('/attendance/staff/my/summary', {
      params,
    }),

  // ── Student leave requests (review loop) ──────────────────────────────────
  listLeaveRequests: (params: { status?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<StudentLeaveRequest>>>('/attendance/leave', {
      params,
    }),

  reviewLeave: (id: string, data: ReviewLeaveData) =>
    api.patch<ApiResponse<StudentLeaveRequest>>(`/attendance/leave/${id}/review`, data),

  getStudentHistory: (
    studentId: string,
    params: { fromDate?: string; toDate?: string; page?: number; limit?: number },
  ) =>
    api.get<ApiResponse<PaginatedResponse<AttendanceRecord>>>(
      `/attendance/students/${studentId}/history`,
      { params },
    ),

  // WEB-P Phase 5 — POST /attendance/leave, PARENT filing leave for a child.
  // Distinct from /hr/leave (staff leave) — unrelated endpoint, unrelated shape.
  applyLeave: (data: ApplyChildLeaveData) =>
    api.post<ApiResponse<StudentLeaveRequest>>('/attendance/leave', data),
};
