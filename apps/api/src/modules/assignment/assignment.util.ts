/**
 * EDU-1 late-boundary rule: a submission is LATE when it lands after the due
 * date's END OF DAY in Asia/Kathmandu — the platform's date discipline
 * (offset arithmetic like todayInNepal(); no toISOString date math, no
 * local-frame Dates). Exported for the both-sides boundary unit tests.
 */

/** Nepal is UTC+05:45 = 345 minutes ahead of UTC. */
const NEPAL_OFFSET_MS = 345 * 60 * 1000;

/** The last instant of `yyyy-mm-dd` in Asia/Kathmandu, as a UTC Date. */
export function endOfDayInNepal(dateAd: string): Date {
  // Nepal midnight AFTER the due date = UTC midnight of that date + 24h − offset;
  // the last included instant is 1 ms before it.
  const utcMidnight = Date.parse(`${dateAd}T00:00:00Z`);
  return new Date(utcMidnight + 24 * 60 * 60 * 1000 - NEPAL_OFFSET_MS - 1);
}

/** SUBMITTED vs LATE for a submission instant against a DATE due date. */
export function computeSubmissionStatus(
  dueDateAd: string,
  submittedAtMs: number,
): 'SUBMITTED' | 'LATE' {
  return submittedAtMs > endOfDayInNepal(dueDateAd).getTime() ? 'LATE' : 'SUBMITTED';
}
