import type { BillInvoice } from '@/types/api.types';

/**
 * BILLING-CUTOVER Phase 1 — sums a student's year's invoices for the parent
 * Fees page's summary cards. `netAmount` (this invoice's own charge), never
 * `totalReceivable` (netAmount + carried-forward previousBalance) — summing
 * totalReceivable across a student's invoices double-counts every carried
 * balance. Balance Due is intentionally NOT derived here — it comes from
 * the separate, authoritative `GET /finance/students/:studentId/balance`
 * (same double-counting trap applies to `balance` even more directly).
 */
export function sumInvoiceTotals(invoices: BillInvoice[]): { totalInvoiced: number; totalPaid: number } {
  return invoices.reduce(
    (acc, inv) => ({
      totalInvoiced: acc.totalInvoiced + inv.netAmount,
      totalPaid: acc.totalPaid + inv.paidAmount,
    }),
    { totalInvoiced: 0, totalPaid: 0 },
  );
}
