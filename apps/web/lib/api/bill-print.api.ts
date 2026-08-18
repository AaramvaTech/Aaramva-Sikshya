import api from '@/lib/api';
import type {
  ApiResponse, PrintDocumentResponse, BulkAssignJob, PrintClassData,
} from '@/types/api.types';
import type { PrintLanguage, ReceiptFormat } from '@/lib/print-document';

/**
 * BILL-8-UI — the print engine's two single-document endpoints. Both return
 * `{ presignedUrl, generated }`, NOT a PDF body, so neither is a download in
 * the axios sense — see `lib/print-document.ts` for why the URL is used
 * immediately and never cached (addendum A4).
 *
 * `lang` is a staff-only override server-side: both controllers drop it for a
 * PARENT caller and fall back to the tenant default. Harmless to always send
 * from this admin surface, which is staff-only anyway.
 */
export const billPrintApi = {
  invoicePdf: (invoiceId: string, lang?: PrintLanguage) =>
    api.get<ApiResponse<PrintDocumentResponse>>(`/finance/bill/invoices/${invoiceId}/pdf`, {
      params: lang ? { lang } : undefined,
    }),

  /**
   * BILL-PRINT-1: `format` picks the 80mm thermal roll (the counter printer,
   * and the server's default) or the A5 stationery. It is a CALL-SITE choice —
   * there is no tenant setting and no schema column behind it.
   */
  receipt: (paymentId: string, lang?: PrintLanguage, format?: ReceiptFormat) =>
    api.get<ApiResponse<PrintDocumentResponse>>(`/finance/bill/payments/${paymentId}/receipt`, {
      params: { ...(lang ? { lang } : {}), ...(format ? { format } : {}) },
    }),

  // ─── Phase 2 — bulk print (background jobs) ────────────────────────────────
  // Both return a job row, not a document; progress and the merged PDF's
  // download URL arrive via the shared GET /finance/jobs/:id.

  /** Month-end: every non-VOIDED invoice in a posted run. */
  printRun: (runId: string, lang?: PrintLanguage) =>
    api.post<ApiResponse<BulkAssignJob>>(`/finance/bill/runs/${runId}/print`, undefined, {
      params: lang ? { lang } : undefined,
    }),

  /** Ad hoc (addendum A1): one class + BS period, optionally one section. */
  printClass: (data: PrintClassData, lang?: PrintLanguage) =>
    api.post<ApiResponse<BulkAssignJob>>('/finance/bill/print/class', data, {
      params: lang ? { lang } : undefined,
    }),
};
