import api from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  StudentFeeStructureAssignment,
  AssignFeeStructureData,
  StudentFeeOverride,
  CreateStudentFeeOverrideData,
  UpdateStudentFeeOverrideData,
  StudentConcession,
  CreateStudentConcessionData,
  UpdateStudentConcessionData,
  StudentTransportAssignment,
  CreateStudentTransportAssignmentData,
  UpdateStudentTransportAssignmentData,
  BulkAssignData,
  BulkAssignJob,
  FeePreview,
  ConcessionRegisterEntry,
} from '@/types/api.types';

/** UI-2 — one client module for the BILL-2 assignment surface, mirroring
 * BillAssignmentController's own section order on the backend. */
export const billAssignmentApi = {
  feeStructureAssignment: {
    listForStudent: (studentId: string, academicYearId?: string) =>
      api.get<ApiResponse<StudentFeeStructureAssignment[]>>(
        `/finance/students/${studentId}/fee-structure`,
        { params: academicYearId ? { academicYearId } : undefined },
      ),
    assign: (studentId: string, data: AssignFeeStructureData) =>
      api.post<ApiResponse<StudentFeeStructureAssignment>>(`/finance/students/${studentId}/fee-structure`, data),
  },

  bulkAssign: {
    create: (feeStructureId: string, data: BulkAssignData) =>
      api.post<ApiResponse<BulkAssignJob>>(`/finance/bill/fee-structures/${feeStructureId}/bulk-assign`, data),
    getJob: (jobId: string) => api.get<ApiResponse<BulkAssignJob>>(`/finance/jobs/${jobId}`),
  },

  feeOverrides: {
    list: (params: { studentId?: string; academicYearId?: string } = {}) =>
      api.get<ApiResponse<PaginatedResponse<StudentFeeOverride>>>('/finance/fee-overrides', { params: { limit: 100, ...params } }),
    create: (data: CreateStudentFeeOverrideData) => api.post<ApiResponse<StudentFeeOverride>>('/finance/fee-overrides', data),
    update: (id: string, data: UpdateStudentFeeOverrideData) =>
      api.patch<ApiResponse<StudentFeeOverride>>(`/finance/fee-overrides/${id}`, data),
    delete: (id: string) => api.delete(`/finance/fee-overrides/${id}`),
  },

  concessions: {
    list: (params: { studentId?: string; academicYearId?: string } = {}) =>
      api.get<ApiResponse<PaginatedResponse<StudentConcession>>>('/finance/concessions', { params: { limit: 100, ...params } }),
    create: (data: CreateStudentConcessionData) => api.post<ApiResponse<StudentConcession>>('/finance/concessions', data),
    update: (id: string, data: UpdateStudentConcessionData) =>
      api.patch<ApiResponse<StudentConcession>>(`/finance/concessions/${id}`, data),
    delete: (id: string) => api.delete(`/finance/concessions/${id}`),
  },

  transportAssignments: {
    list: (params: { studentId?: string } = {}) =>
      api.get<ApiResponse<PaginatedResponse<StudentTransportAssignment>>>('/finance/transport-assignments', { params: { limit: 100, ...params } }),
    create: (data: CreateStudentTransportAssignmentData) =>
      api.post<ApiResponse<StudentTransportAssignment>>('/finance/transport-assignments', data),
    update: (id: string, data: UpdateStudentTransportAssignmentData) =>
      api.patch<ApiResponse<StudentTransportAssignment>>(`/finance/transport-assignments/${id}`, data),
    delete: (id: string) => api.delete(`/finance/transport-assignments/${id}`),
  },

  feePreview: {
    get: (studentId: string, params: { academicYearId: string; asOfDate?: string }) =>
      api.get<ApiResponse<FeePreview>>(`/finance/students/${studentId}/fee-preview`, { params }),
  },

  // UI-6 §4.8 — Concession Register tab (BillAssignmentController's own "Reports & preview" section)
  reports: {
    concessionRegister: (params: { page?: number; limit?: number; academicYearId?: string; classId?: string; discountReasonId?: string } = {}) =>
      api.get<ApiResponse<PaginatedResponse<ConcessionRegisterEntry>>>('/finance/reports/concession-register', { params }),
  },
};
