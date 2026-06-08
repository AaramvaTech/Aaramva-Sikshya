import { cn } from '@/lib/utils';
import type { InvoiceSummary } from '@/types/api.types';

const styles: Record<InvoiceSummary['status'], string> = {
  PAID: 'bg-success-100 text-success-700',
  PARTIAL: 'bg-yellow-100 text-yellow-800',
  UNPAID: 'bg-orange-100 text-orange-800',
  OVERDUE: 'bg-error-100 text-red-800 font-semibold',
  WAIVED: 'bg-gray-100 text-gray-600',
};

const labels: Record<InvoiceSummary['status'], string> = {
  PAID: 'Paid',
  PARTIAL: 'Partial',
  UNPAID: 'Unpaid',
  OVERDUE: 'Overdue',
  WAIVED: 'Waived',
};

interface InvoiceStatusBadgeProps {
  status: InvoiceSummary['status'];
  className?: string;
}

export function InvoiceStatusBadge({ status, className }: InvoiceStatusBadgeProps) {
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
