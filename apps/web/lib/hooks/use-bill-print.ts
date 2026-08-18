import { useMutation } from '@tanstack/react-query';
import { billPrintApi } from '@/lib/api/bill-print.api';
import { billAssignmentApi } from '@/lib/api/bill-assignment.api';
import type { PrintLanguage, ReceiptFormat } from '@/lib/print-document';
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
    mutationFn: (
      { paymentId, lang, format }: { paymentId: string; lang?: PrintLanguage; format?: ReceiptFormat },
    ) => billPrintApi.receipt(paymentId, lang, format).then((r) => r.data.data),
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

/**
 * Addendum A4, applied to bulk: a completed job's `downloadUrl` is presigned
 * fresh on every read (`BillPrintJobService.findOne`), so the 300s clock starts
 * when the client last polled. <BulkJobProgress> stops polling at a terminal
 * status, which means a rendered href goes stale after five minutes of an open
 * dialog — the exact defect A4 exists to prevent.
 *
 * So the download re-fetches the job AT CLICK TIME and opens whatever URL that
 * returns. A mutation, for the same reason the single-document hooks are:
 * nothing may cache the link.
 */
export function useJobDownloadUrl() {
  return useMutation({
    mutationFn: (jobId: string) =>
      billAssignmentApi.bulkAssign.getJob(jobId).then((r) => r.data.data.downloadUrl),
  });
}
