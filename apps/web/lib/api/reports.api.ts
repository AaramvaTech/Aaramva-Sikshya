import api from '@/lib/api';

export interface RangeParams {
  from?: string;
  to?: string;
  classId?: string;
  sectionId?: string;
}

export const reportsApi = {
  attendanceTrends: (params: RangeParams & { groupBy?: string }) =>
    api.get('/reports/attendance/trends', { params }),
  classComparison: (classId: string, params: { from?: string; to?: string }) =>
    api.get(`/reports/attendance/class-comparison/${classId}`, { params }),
  lowAttendance: (params: RangeParams & { threshold?: number }) =>
    api.get('/reports/attendance/low', { params }),
  staffSummary: (params: { from?: string; to?: string }) =>
    api.get('/reports/attendance/staff', { params }),

  publishedExams: (academicYearId?: string) =>
    api.get('/reports/exams/published', { params: { academicYearId } }),
  examSummary: (examTypeId: string, classId?: string) =>
    api.get(`/reports/exams/summary/${examTypeId}`, { params: { classId } }),
  examComparison: (examTypeId: string) => api.get(`/reports/exams/comparison/${examTypeId}`),

  feeAging: (params: { asOf?: string; classId?: string }) =>
    api.get('/reports/finance/aging', { params }),

  // UI-6 — Billing Reports page (§4.3-4.7 of UI-6-SPEC.md)
  daybook: (params: { bsDate?: string }) => api.get('/reports/finance/daybook', { params }),
  financeDefaulters: (params: { classId?: string; minBalance?: string; sort?: string }) =>
    api.get('/reports/finance/defaulters', { params }),
  collectionSummary: (params: { from?: string; to?: string; groupBy?: string }) =>
    api.get('/reports/finance/collection', { params }),
  fines: (params: { from?: string; to?: string; classId?: string }) =>
    api.get('/reports/finance/fines', { params }),
};
