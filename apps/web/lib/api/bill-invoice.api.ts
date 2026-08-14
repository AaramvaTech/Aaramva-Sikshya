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

  /** BILLING-CUTOVER Phase 1 — `list` above hits `GET /finance/bill/invoices`
   * (BillInvoiceController#findAll), ACCOUNTANT_AND_ABOVE only. PARENT needs
   * the separate `GET /finance/students/:studentId/bill/invoices`
   * (#findByStudent) — same controller, same ACCOUNTANT_AND_ABOVE + PARENT
   * guard and guardian-ownership scoping as every other student-scoped
   * finance route (live-confirmed, BILLING-CUTOVER Phase 1). */
  listByStudent: (
    studentId: string,
    params: { page?: number; limit?: number; academicYearId?: string; status?: string } = {},
  ) =>
    api.get<ApiResponse<PaginatedResponse<BillInvoice>>>(
      `/finance/students/${studentId}/bill/invoices`,
      { params },
    ),
};
