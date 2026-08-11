import { cn } from '@/lib/utils';
import type { BillPaymentStatus } from '@/types/api.types';

// UI-4-CHECKPOINT-A-SPEC.md §4 — own styles/labels map, mirroring
// invoice-status-badge.tsx / bill-run-outcome-badge.tsx's precedent. PENDING
// is amber, not red — B5-5's own framing: "a pending cheque is a promise,
// not money." VOIDED is neutral gray, same "administrative, not an error"
// treatment UI-3 gave EXCLUDED.
const styles: Record<BillPaymentStatus, string> = {
  CLEARED: 'bg-success-50 text-success-700',
  PENDING: 'bg-warning-50 text-warning-700',
  BOUNCED: 'bg-error-100 text-red-800 font-semibold',
  VOIDED: 'bg-gray-100 text-gray-600',
};

const labels: Record<BillPaymentStatus, string> = {
  CLEARED: 'Cleared',
  PENDING: 'Pending',
  BOUNCED: 'Bounced',
  VOIDED: 'Voided',
};

interface BillPaymentStatusBadgeProps {
  status: BillPaymentStatus;
  className?: string;
}

export function BillPaymentStatusBadge({ status, className }: BillPaymentStatusBadgeProps) {
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
