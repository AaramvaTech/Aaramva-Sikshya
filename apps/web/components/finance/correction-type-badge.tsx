import { cn } from '@/lib/utils';
import type { BillCorrectionType } from '@/types/api.types';

// UI-5-SPEC.md §4 — own styles/labels map, same precedent as
// bill-run-outcome-badge.tsx / bill-payment-status-badge.tsx. Type and
// status are orthogonal (both show in the same row), so this stays a
// separate fixed-color map rather than reusing <StatusBadge>'s palette.
const styles: Record<BillCorrectionType, string> = {
  CREDIT_NOTE: 'bg-brand-50 text-brand-700 dark:bg-brand-500/[0.12] dark:text-brand-400',
  REFUND: 'bg-blue-50 text-blue-700 dark:bg-blue-500/[0.12] dark:text-blue-400',
  WRITE_OFF: 'bg-violet-100 text-violet-700 dark:bg-violet-500/[0.12] dark:text-violet-400',
};

const labels: Record<BillCorrectionType, string> = {
  CREDIT_NOTE: 'Credit Note',
  REFUND: 'Refund',
  WRITE_OFF: 'Write-off',
};

interface CorrectionTypeBadgeProps {
  type: BillCorrectionType;
  className?: string;
}

export function CorrectionTypeBadge({ type, className }: CorrectionTypeBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        styles[type] ?? 'bg-gray-100 text-gray-600',
        className,
      )}
    >
      {labels[type] ?? type}
    </span>
  );
}
