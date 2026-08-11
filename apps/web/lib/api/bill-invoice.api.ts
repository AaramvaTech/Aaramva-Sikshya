import api from '@/lib/api';
import type { ApiResponse, PaginatedResponse, BillInvoice } from '@/types/api.types';

/** UI-4 — read-only client for BillInvoiceController's list/detail routes
 * (BILL-4), consumed by the payment counter to show a student's outstanding
 * invoices (now carrying paidAmount/balance, UI-4 §2). */
export const billInvoiceApi = {
  list: (
    params: {
      page?: number; limit?: number; studentId?: string; classId?: string;
      academicYearId?: string; bsYear?: number; bsMonth?: number; status?: string;
    } = {},
  ) => api.get<ApiResponse<PaginatedResponse<BillInvoice>>>('/finance/bill/invoices', { params }),

  get: (id: string) => api.get<ApiResponse<BillInvoice>>(`/finance/bill/invoices/${id}`),
};
