import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BillRunLineOutcome } from '@/types/api.types';

// UI-3-SPEC.md §6 — own styles/labels maps, mirroring the established
// invoice-status-badge.tsx precedent rather than the generic <StatusBadge>,
// since every outcome here can carry a caption (the skipReason) the generic
// component doesn't support. Skips are deliberately neutral, not red — a
// skip is an expected state (no assignment, already billed), not an error;
// only FAILED (a real post-time failure) gets the error color.
export const styles: Record<BillRunLineOutcome, string> = {
  DRAFT: 'bg-success-50 text-success-700',
  POSTED: 'bg-success-100 text-success-700',
  SKIPPED_NO_ASSIGNMENT: 'bg-gray-100 text-gray-600',
  SKIPPED_ALREADY_BILLED: 'bg-gray-100 text-gray-600',
  EXCLUDED: 'bg-violet-100 text-violet-700',
  FAILED: 'bg-error-100 text-red-800 font-semibold',
};

export const labels: Record<BillRunLineOutcome, string> = {
  DRAFT: 'Will be charged',
  POSTED: 'Charged',
  SKIPPED_NO_ASSIGNMENT: 'No fee assigned',
  SKIPPED_ALREADY_BILLED: 'Already billed',
  EXCLUDED: 'Excluded',
  FAILED: 'Failed',
};

interface BillRunOutcomeBadgeProps {
  outcome: BillRunLineOutcome;
  skipReason?: string | null;
  className?: string;
}

export function BillRunOutcomeBadge({ outcome, skipReason, className }: BillRunOutcomeBadgeProps) {
  return (
    <div className={className}>
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs',
          styles[outcome] ?? 'bg-gray-100 text-gray-600',
        )}
      >
        {outcome === 'POSTED' && <CheckCircle2 className="h-3 w-3" />}
        {labels[outcome] ?? outcome}
      </span>
      {skipReason && <p className="mt-1 text-xs text-gray-400">{skipReason}</p>}
    </div>
  );
}
