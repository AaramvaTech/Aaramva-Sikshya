import type { BillPaymentAllocation } from '@/types/api.types';

/** Invoices show their human number (BINV-…); the uuid tail is only a fallback
 * for an allocation whose invoice number didn't come back. A fine allocation
 * has no invoice id of its own (billInvoiceId is null by the 0039 CHECK), so
 * it shows the number of the invoice the fine accrued on. */
export function allocationLabel(a: Pick<BillPaymentAllocation, 'billInvoiceId' | 'billFineAccrualId' | 'invoiceNumber' | 'fineInvoiceNumber'>): string {
  if (a.billInvoiceId) return a.invoiceNumber ? `Invoice ${a.invoiceNumber}` : `Invoice …${a.billInvoiceId.slice(-8)}`;
  if (a.fineInvoiceNumber) return `Late fee on ${a.fineInvoiceNumber}`;
  return `Late fee …${a.billFineAccrualId?.slice(-8)}`;
}
