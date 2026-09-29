// Year list + AD formatting for <BsDateInput>. Kept pure so it can be unit-tested.

// bs-calendar's lookup table covers BS 2000–2099 (packages/bs-calendar/src/data.ts);
// bsToAd throws outside it, so never offer a year beyond it.
export const BS_TABLE_MIN_YEAR = 2000;
export const BS_TABLE_MAX_YEAR = 2099;

/** Selectable BS years, newest first. Default window: today-10 … today+5, clamped to the table. */
export function bsYearRange(todayYear: number, minYear?: number, maxYear?: number): number[] {
  const lo = Math.max(minYear ?? todayYear - 10, BS_TABLE_MIN_YEAR);
  const hi = Math.min(maxYear ?? todayYear + 5, BS_TABLE_MAX_YEAR);
  return Array.from({ length: Math.max(hi - lo + 1, 0) }, (_, i) => hi - i);
}

/**
 * "YYYY-MM-DD" from a Date built in the LOCAL frame (bsToAd's output). `toISOString()` would
 * shift it back a day under UTC+ zones (Nepal = UTC+5:45): 1 Shrawan 2083 → 2026-07-16, wrong.
 */
export function toLocalAdString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
