import api from '@/lib/api';
import type {
  ApiResponse,
  ExamType,
  ExamSchedule,
  MyExamSchedule,
  MarkRecord,
  ClassResultRow,
  ReportCard,
  GradingScale,
  ComputeResultSummary,
  CreateExamTypeData,
  CreateGradingScaleData,
  BulkCreateScheduleData,
  BulkMarksData,
} from '@/types/api.types';

export const examinationApi = {
  // Exam types
  listExamTypes: (params?: { academicYearId?: string }) =>
    api.get<ApiResponse<ExamType[]>>('/exams/types', { params }),
  createExamType: (data: CreateExamTypeData) =>
    api.post<ApiResponse<ExamType>>('/exams/types', data),
  updateExamType: (id: string, data: { name?: string; weightPercent?: number; orderIndex?: number }) =>
    api.patch<ApiResponse<ExamType>>(`/exams/types/${id}`, data),
  deleteExamType: (id: string) =>
    api.delete(`/exams/types/${id}`),
  setExamTypePublished: (id: string, published: boolean) =>
    api.patch<ApiResponse<ExamType>>(`/exams/types/${id}/publish`, { published }),

  // Schedules
  listSchedules: (params: { examTypeId?: string; classId?: string }) =>
    api.get<ApiResponse<ExamSchedule[]>>('/exams/schedules', { params }),
  // WEB-P Phase 2 Task 3 — teacher-portal picker: server-side scoped to the
  // caller's own (class, subject) timetable pairs (TEACHER_AND_ABOVE).
  getMySchedules: (params?: { examTypeId?: string }) =>
    api.get<ApiResponse<MyExamSchedule[]>>('/exams/schedules/my', { params }),
  bulkCreateSchedules: (data: BulkCreateScheduleData) =>
    api.post<ApiResponse<ExamSchedule[]>>('/exams/schedules/bulk', data),
  updateSchedule: (
    id: string,
    data: Partial<{
      examDate: string;
      startTime: string;
      endTime: string;
      fullMarks: number;
      passMarks: number;
      room: string;
    }>,
  ) => api.patch<ApiResponse<ExamSchedule>>(`/exams/schedules/${id}`, data),

  // Marks — backend wraps in { data: [], meta: { total } } before ResponseInterceptor
  getMarksForSchedule: (scheduleId: string) =>
    api.get<ApiResponse<{ data: MarkRecord[]; meta: { total: number } }>>(
      `/exams/marks?examScheduleId=${scheduleId}`,
    ),
  bulkEnterMarks: (data: BulkMarksData) =>
    api.post<ApiResponse<MarkRecord[]>>('/exams/marks/bulk', data),

  // Results
  computeResults: (data: {
    examTypeId: string;
    classId: string;
    sectionId?: string;
  }) =>
    api.post<ApiResponse<ComputeResultSummary>>('/exams/results/compute', data),
  getClassResults: (classId: string, params: { examTypeId: string }) =>
    api.get<ApiResponse<ClassResultRow[]>>(
      `/exams/results/class/${classId}`,
      { params },
    ),
  getReportCard: (studentId: string) =>
    api.get<ApiResponse<ReportCard>>(
      `/exams/results/report-card/${studentId}`,
    ),

  // Grading scales (POL-1 T6)
  listGradingScales: () =>
    api.get<ApiResponse<GradingScale[]>>('/exams/grading-scales'),
  getGradingScale: (id: string) =>
    api.get<ApiResponse<GradingScale>>(`/exams/grading-scales/${id}`),
  createGradingScale: (data: CreateGradingScaleData) =>
    api.post<ApiResponse<GradingScale>>('/exams/grading-scales', data),
  renameGradingScale: (id: string, data: { name: string }) =>
    api.patch<ApiResponse<GradingScale>>(`/exams/grading-scales/${id}`, data),
  setDefaultGradingScale: (id: string) =>
    api.patch<ApiResponse<GradingScale>>(`/exams/grading-scales/${id}/set-default`),
};
