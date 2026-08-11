import api from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  BillRunSummary,
  BillRunDetail,
  CreateBillRunData,
  ExcludeBillRunLinesData,
} from '@/types/api.types';

/** UI-3 — one client module for the BILL-4 bill-run surface, mirroring
 * BillRunController's own route order on the backend. */
export const billRunApi = {
  list: (
    params: {
      page?: number; limit?: number; academicYearId?: string; bsYear?: number; bsMonth?: number; status?: string;
    } = {},
  ) => api.get<ApiResponse<PaginatedResponse<BillRunSummary>>>('/finance/bill/runs', { params }),

  create: (data: CreateBillRunData) => api.post<ApiResponse<BillRunSummary>>('/finance/bill/runs', data),

  get: (id: string, params: { page?: number; limit?: number; outcome?: string; classId?: string } = {}) =>
    api.get<ApiResponse<BillRunDetail>>(`/finance/bill/runs/${id}`, { params }),

  exclude: (id: string, data: ExcludeBillRunLinesData) =>
    api.patch<ApiResponse<BillRunDetail>>(`/finance/bill/runs/${id}/exclude`, data),

  post: (id: string) => api.post<ApiResponse<BillRunSummary>>(`/finance/bill/runs/${id}/post`, {}),

  void: (id: string) => api.delete<ApiResponse<BillRunSummary>>(`/finance/bill/runs/${id}`),
};
