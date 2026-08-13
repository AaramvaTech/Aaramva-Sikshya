import api from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  BillCorrection,
  BillCorrectionDetail,
  CreateCreditNoteData,
  CreateRefundData,
  CreateWriteOffData,
  DecideCorrectionData,
  FinanceSettings,
} from '@/types/api.types';

/** UI-5 — one client module for the BILL-6 corrections surface, mirroring
 * BillCorrectionController's own route order on the backend. */
export const billCorrectionApi = {
  requestCreditNote: (data: CreateCreditNoteData) =>
    api.post<ApiResponse<BillCorrection>>('/finance/corrections/credit-notes', data),

  requestRefund: (data: CreateRefundData) =>
    api.post<ApiResponse<BillCorrection>>('/finance/corrections/refunds', data),

  requestWriteOff: (data: CreateWriteOffData) =>
    api.post<ApiResponse<BillCorrection>>('/finance/corrections/write-offs', data),

  list: (
    params: { page?: number; limit?: number; studentId?: string; type?: string; status?: string } = {},
  ) => api.get<ApiResponse<PaginatedResponse<BillCorrection>>>('/finance/corrections', { params }),

  get: (id: string) => api.get<ApiResponse<BillCorrectionDetail>>(`/finance/corrections/${id}`),

  approve: (id: string, data: DecideCorrectionData) =>
    api.post<ApiResponse<BillCorrection>>(`/finance/corrections/${id}/approve`, data),

  reject: (id: string, data: DecideCorrectionData) =>
    api.post<ApiResponse<BillCorrection>>(`/finance/corrections/${id}/reject`, data),

  reverse: (id: string) =>
    api.post<ApiResponse<BillCorrection>>(`/finance/corrections/${id}/reverse`),
};

/** UI-5 §0/ruling 1 — read-only this phase, feeds the New Correction cap
 * preview. Editing the threshold is UI-7 (Settings) scope. */
export const financeSettingsApi = {
  get: () => api.get<ApiResponse<FinanceSettings>>('/finance/settings'),
};
