import api from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  BillPayment,
  CreateBillPaymentData,
  UpdateChequeStatusData,
  VoidPaymentData,
  StudentBalance,
} from '@/types/api.types';

/** UI-4 — one client module for the BILL-5 payment surface, mirroring
 * BillPaymentController's own route order on the backend. */
export const billPaymentApi = {
  record: (data: CreateBillPaymentData) => api.post<ApiResponse<BillPayment>>('/finance/bill/payments', data),

  list: (
    params: {
      page?: number; limit?: number; studentId?: string; method?: string; status?: string;
      dateFrom?: string; dateTo?: string;
    } = {},
  ) => api.get<ApiResponse<PaginatedResponse<BillPayment>>>('/finance/bill/payments', { params }),

  get: (id: string) => api.get<ApiResponse<BillPayment>>(`/finance/bill/payments/${id}`),

  updateChequeStatus: (id: string, data: UpdateChequeStatusData) =>
    api.patch<ApiResponse<BillPayment>>(`/finance/bill/payments/${id}/cheque-status`, data),

  void: (id: string, data: VoidPaymentData) =>
    api.post<ApiResponse<BillPayment>>(`/finance/bill/payments/${id}/void`, data),

  /** Ledger's general balance endpoint — `sign: 'ADVANCE'` is available credit. */
  getStudentBalance: (studentId: string) =>
    api.get<ApiResponse<StudentBalance>>(`/finance/students/${studentId}/balance`),
};
