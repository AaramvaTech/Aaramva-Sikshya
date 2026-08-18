import type { BulkAssignFailureReason } from '@/types/api.types';

/**
 * BILL-8-UI Phase 2 — `GET /finance/jobs/:id` serves BOTH job families
 * (bulk-assign and bill-print; the controller tries one and falls back to the
 * other). Their rows are the same shape except for the failure key:
 * bulk-assign writes `{studentId, error, reason?}`, bill-print writes
 * `{invoiceId, error}`.
 *
 * Rather than fork <BulkJobProgress>, both are normalised to one entry type
 * here. Kept as a pure function so the union handling is testable without a
 * browser.
 */

export interface RawJobFailure {
  studentId?: string;
  invoiceId?: string;
  error: string;
  /** FEE-CLASS-GUARD: optional, absent on every pre-guard bulk-assign row. */
  reason?: BulkAssignFailureReason;
}

export interface NormalizedJobFailure {
  /** Whichever id the job family keys its failures by. */
  id: string;
  error: string;
  reason?: BulkAssignFailureReason;
}

/** What the failing rows are, for the "N ___ skipped" wording. */
export type JobNoun = 'student' | 'invoice';

/**
 * `studentId` wins when both are somehow present — bulk-assign is the older
 * family and the one with `reason`, so it stays authoritative. A row with
 * neither id still renders (falling back to an empty id) rather than being
 * dropped: losing a failure silently is worse than showing one without a
 * name, since the count beside it would then disagree with the list.
 */
export function normalizeJobFailures(failures: RawJobFailure[] | undefined | null): NormalizedJobFailure[] {
  if (!failures) return [];
  return failures.map((f) => ({
    id: f.studentId ?? f.invoiceId ?? '',
    error: f.error,
    ...(f.reason ? { reason: f.reason } : {}),
  }));
}

/** "1 student skipped" / "3 invoices skipped". */
export function skippedLabel(count: number, noun: JobNoun): string {
  return `${count} ${noun}${count === 1 ? '' : 's'} skipped`;
}

/** "All 12 students assigned successfully." / "All 12 invoices printed successfully." */
export function successLabel(total: number, noun: JobNoun): string {
  const verb = noun === 'student' ? 'assigned' : 'printed';
  return `All ${total} ${noun}${total === 1 ? '' : 's'} ${verb} successfully.`;
}
