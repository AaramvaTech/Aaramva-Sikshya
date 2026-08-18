import { useMutation } from '@tanstack/react-query';
import { billPrintApi } from '@/lib/api/bill-print.api';
import type { PrintLanguage } from '@/lib/print-document';

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
