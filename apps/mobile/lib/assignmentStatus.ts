import type { MyAssignment, SubmissionStatus } from '../types';

/**
 * EDU-2 semantic status palette — like attendance's STATUS_CONFIG these are
 * NOT brand-coupled literals (documented exception to "tokens only"):
 * OPEN neutral, SUBMITTED green, LATE amber, REVIEWED blue, OVERDUE red.
 */
/** `labelKey` is a `common` namespace key (I18N-1): screens render
 *  `t(chip.labelKey)`. `label` stays as the English fallback for tests/tools. */
export const SUBMISSION_CHIPS: Record<
  SubmissionStatus | 'OPEN' | 'OVERDUE',
  { label: string; labelKey: string; bg: string; color: string }
> = {
  OPEN: { label: 'To do', labelKey: 'common:submission.toDo', bg: '#F1F5F9', color: '#475569' },
  OVERDUE: { label: 'Overdue', labelKey: 'common:submission.overdue', bg: '#FEE2E2', color: '#DC2626' },
  SUBMITTED: { label: 'Submitted', labelKey: 'common:submission.submitted', bg: '#DCFCE7', color: '#15803D' },
  LATE: { label: 'Late', labelKey: 'common:submission.late', bg: '#FEF3C7', color: '#B45309' },
  REVIEWED: { label: 'Reviewed', labelKey: 'common:submission.reviewed', bg: '#DBEAFE', color: '#1D4ED8' },
};

/** True when the due date's calendar day is already behind the device's day.
 *  Display-only nudge — the SERVER's Kathmandu end-of-day rule is authoritative
 *  for the actual LATE stamp. */
export function isPastDue(dueDate: string, now: Date = new Date()): boolean {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return dueDate < `${y}-${m}-${d}`;
}

/** The chip for a student's view of an assignment. Exported for unit tests. */
export function chipFor(a: Pick<MyAssignment, 'dueDate' | 'mySubmission'>, now?: Date) {
  if (a.mySubmission) return SUBMISSION_CHIPS[a.mySubmission.status];
  return isPastDue(a.dueDate, now) ? SUBMISSION_CHIPS.OVERDUE : SUBMISSION_CHIPS.OPEN;
}
