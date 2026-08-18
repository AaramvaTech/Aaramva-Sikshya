import api from '@/lib/api';
import type { ApiResponse, PrintDocumentResponse } from '@/types/api.types';
import type { PrintLanguage } from '@/lib/print-document';

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

  receipt: (paymentId: string, lang?: PrintLanguage) =>
    api.get<ApiResponse<PrintDocumentResponse>>(`/finance/bill/payments/${paymentId}/receipt`, {
      params: lang ? { lang } : undefined,
    }),
};
