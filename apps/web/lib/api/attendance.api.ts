import api from '@/lib/api';
import type {
  ApiResponse,
  AttendanceRecord,
  BulkAttendanceData,
  StudentAttendanceSummary,
  SectionAttendanceReport,
  SchoolAttendanceSummary,
} from '@/types/api.types';

export const attendanceApi = {
  bulkMark: (data: BulkAttendanceData) =>
    api.post<ApiResponse<{ count: number }>>('/attendance/students/bulk', data),

  getSectionAttendance: (params: {
    sectionId: string;
    date: string;
    academicYearId?: string;
  }) => api.get<ApiResponse<AttendanceRecord[]>>('/attendance/students', { params }),

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
};
