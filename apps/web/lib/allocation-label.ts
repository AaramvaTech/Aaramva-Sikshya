import type { BillPaymentAllocation } from '@/types/api.types';

/** Invoices show their human number (BINV-…); the uuid tail is only a fallback
 * for an allocation whose invoice number didn't come back. Fine allocations
 * carry no invoice number, so they keep the id tail. */
export function allocationLabel(a: Pick<BillPaymentAllocation, 'billInvoiceId' | 'billFineAccrualId' | 'invoiceNumber'>): string {
  if (a.billInvoiceId) return a.invoiceNumber ? `Invoice ${a.invoiceNumber}` : `Invoice …${a.billInvoiceId.slice(-8)}`;
  return `Late fee …${a.billFineAccrualId?.slice(-8)}`;
}
