import { useMutation } from '@tanstack/react-query';
import { billPrintApi } from '@/lib/api/bill-print.api';
import type { PrintLanguage } from '@/lib/print-document';
import type { PrintClassData } from '@/types/api.types';

/**
 * BILL-8-UI — deliberately `useMutation`, not `useQuery`.
 *
 * A presigned read URL lives 300s (addendum A4). A query would cache it under
 * a key and hand a dead link back on the next click within the cache window;
 * a mutation has no cache at all, so every print necessarily re-fetches a
 * fresh URL. The "wrong" primitive by shape — nothing is being mutated — but
 * the right one by lifetime, which is what matters here.
 */

export function usePrintInvoicePdf() {
  return useMutation({
    mutationFn: ({ invoiceId, lang }: { invoiceId: string; lang?: PrintLanguage }) =>
      billPrintApi.invoicePdf(invoiceId, lang).then((r) => r.data.data),
  });
}

export function usePrintReceipt() {
  return useMutation({
    mutationFn: ({ paymentId, lang }: { paymentId: string; lang?: PrintLanguage }) =>
      billPrintApi.receipt(paymentId, lang).then((r) => r.data.data),
  });
}

// ─── Phase 2 — bulk print ─────────────────────────────────────────────────────
// These create a JOB, so unlike the single-document hooks above they are
// mutations for the ordinary reason. Progress is then polled with the existing
// `useBulkAssignJob` — the status endpoint is shared between both job
// families, so there is no second poller.

export function useBulkPrintRun() {
  return useMutation({
    mutationFn: ({ runId, lang }: { runId: string; lang?: PrintLanguage }) =>
      billPrintApi.printRun(runId, lang).then((r) => r.data.data),
  });
}

export function useBulkPrintClass() {
  return useMutation({
    mutationFn: ({ data, lang }: { data: PrintClassData; lang?: PrintLanguage }) =>
      billPrintApi.printClass(data, lang).then((r) => r.data.data),
  });
}
