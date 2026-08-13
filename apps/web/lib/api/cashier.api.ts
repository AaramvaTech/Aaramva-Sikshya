import api from '@/lib/api';
import type {
  ApiResponse,
  CashierShift,
  CashierCloseResult,
  OpenShiftData,
  CloseShiftData,
} from '@/types/api.types';

/** UI-6 §4.10 — one client module for the BILL-9 cashier surface, mirroring
 * CashierController's own route order on the backend. */
export const cashierApi = {
  openShift: (data: OpenShiftData) =>
    api.post<ApiResponse<CashierShift>>('/finance/cashier/shifts/open', data),

  closeShift: (id: string, data: CloseShiftData) =>
    api.post<ApiResponse<CashierCloseResult>>(`/finance/cashier/shifts/${id}/close`, data),

  listShifts: (params: { cashierId?: string; date?: string } = {}) =>
    api.get<ApiResponse<CashierShift[]>>('/finance/cashier/shifts', { params }),
};
