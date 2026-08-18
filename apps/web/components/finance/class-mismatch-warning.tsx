'use client';

import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { describeScope, type ClassScope } from '@/lib/class-guard';

/**
 * Marks an assignment that was made across classes on purpose (spec §3's
 * third bullet — a reviewer looking at this student later must be able to
 * tell an intentional override from a bug). Amber, not red: an override is a
 * recorded decision, not an error — same reasoning as the neutral skip
 * outcomes in bill-run-outcome-badge.tsx.
 */
export function CrossClassBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
      title="Assigned across classes with an explicit override — recorded against the admin who did it"
    >
      <ShieldAlert className="h-3 w-3" />
      Cross-class override
    </span>
  );
}

interface Props {
  /** The fee structure's own class/section — always named, on every variant. */
  structure: ClassScope;
  /** The "…but ___" half of the sentence. Differs per form; see call sites. */
  mismatchWith: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Optional extra detail line (bulk uses it to name the affected students). */
  children?: React.ReactNode;
}

/**
 * FEE-CLASS-GUARD spec §3 — one warning, both forms. The checkbox IS the
 * explicit confirmation the spec requires: callers never send the override
 * flag unless it is ticked, and they re-arm it (untick) whenever any input
 * that could change the verdict changes, so a stale tick can't ride along.
 *
 * The left half of the sentence is fixed here so both forms name the fee
 * structure's class identically; only the right half varies.
 */
export function ClassMismatchWarning({
  structure, mismatchWith, checked, onCheckedChange, children,
}: Props) {
  return (
    <div className="rounded-sm border border-amber-300 bg-amber-50 px-3 py-2.5 dark:border-amber-900 dark:bg-amber-950/20">
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Class mismatch</p>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            This fee structure is for <strong>{describeScope(structure)}</strong>, but {mismatchWith}.
          </p>
          {children}
          <label className="flex cursor-pointer items-start gap-2 pt-0.5">
            <input
              type="checkbox"
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-amber-600"
              checked={checked}
              onChange={(e) => onCheckedChange(e.target.checked)}
            />
            <span className="text-xs text-amber-800 dark:text-amber-300">
              Assign anyway — this is a deliberate cross-class assignment. It will be recorded
              against your account.
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
