import api from '@/lib/api';
import type {
  ApiResponse,
  ExamType,
  ExamSchedule,
  MarkRecord,
  ClassResultRow,
  ReportCard,
  GradingScale,
  ComputeResultSummary,
  CreateExamTypeData,
  BulkCreateScheduleData,
  BulkMarksData,
} from '@/types/api.types';

export const examinationApi = {
  // Exam types
  listExamTypes: (params?: { academicYearId?: string }) =>
    api.get<ApiResponse<ExamType[]>>('/exams/types', { params }),
  createExamType: (data: CreateExamTypeData) =>
    api.post<ApiResponse<ExamType>>('/exams/types', data),

  // Schedules
  listSchedules: (params: { examTypeId?: string; classId?: string }) =>
    api.get<ApiResponse<ExamSchedule[]>>('/exams/schedules', { params }),
  bulkCreateSchedules: (data: BulkCreateScheduleData) =>
    api.post<ApiResponse<ExamSchedule[]>>('/exams/schedules/bulk', data),

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

  // Grading scales
  listGradingScales: () =>
    api.get<ApiResponse<GradingScale[]>>('/exams/grading-scales'),
};
