import { cn } from '@/lib/utils';
import type { BillInvoice } from '@/types/api.types';

// BILLING-CUTOVER Phase 1 — Billing's own invoice-status enum (POSTED/
// SETTLED/PARTIALLY_PAID/VOIDED, see BillInvoiceQueryDto's INVOICE_STATUSES)
// is a different set of values from old Finance's InvoiceSummary['status']
// (PAID/PARTIAL/UNPAID/OVERDUE/WAIVED) that invoice-status-badge.tsx renders
// — not a superset or a rename, so that component can't be reused as-is.
// Own styles/labels map, mirroring its precedent and bill-payment-status-
// badge.tsx's: POSTED still owes money (no separate OVERDUE state exists on
// this rail), same orange as old Finance's UNPAID; VOIDED is neutral gray,
// same "administrative, not an error" treatment as every other VOIDED badge
// in this codebase.
type BillInvoiceStatus = BillInvoice['status'];

const styles: Record<BillInvoiceStatus, string> = {
  POSTED: 'bg-orange-100 text-orange-800',
  PARTIALLY_PAID: 'bg-yellow-100 text-yellow-800',
  SETTLED: 'bg-success-100 text-success-700',
  VOIDED: 'bg-gray-100 text-gray-600',
};

const labels: Record<BillInvoiceStatus, string> = {
  POSTED: 'Unpaid',
  PARTIALLY_PAID: 'Partially Paid',
  SETTLED: 'Paid',
  VOIDED: 'Voided',
};

interface BillInvoiceStatusBadgeProps {
  status: BillInvoiceStatus;
  className?: string;
}

export function BillInvoiceStatusBadge({ status, className }: BillInvoiceStatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs',
        styles[status] ?? 'bg-gray-100 text-gray-600',
        className,
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}
