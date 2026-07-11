/**
 * FIX-2 — TZ-independent formatting for locally-constructed date-only values.
 *
 * `Date.prototype.toISOString()` renders the UTC frame. Formatting a Date that
 * was CONSTRUCTED from local components (`new Date(y, m, d)` — every Date
 * returned by bs-calendar's bsToAd(), hand-built fiscal boundaries, seed dates)
 * with toISOString() shifts the day back one under any UTC+ timezone
 * (Nepal +05:45: local midnight = 18:15Z the previous day). Reading the SAME
 * local components the Date was built from is TZ-independent by construction —
 * proven by the full suite passing under both TZ=Asia/Kathmandu and TZ=UTC.
 *
 * NOT for DB-sourced DATE values (the driver yields UTC-midnight Dates; their
 * existing toISOString() round-trip is frame-consistent) and NOT for
 * timestamps (those are correctly UTC ISO).
 */
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
