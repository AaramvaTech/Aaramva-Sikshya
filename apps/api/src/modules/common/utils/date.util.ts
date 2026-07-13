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

/**
 * QA-1 OBS-E — "today" as an AD 'YYYY-MM-DD' in **Asia/Kathmandu**, TZ-independent.
 *
 * `new Date().toISOString().split('T')[0]` yields UTC-today, which in Nepal
 * (+05:45) is the PREVIOUS day for the first 5h45m after local midnight — the
 * dashboard/summary "today's attendance" then shows yesterday's data all night.
 * Offset arithmetic (add +05:45, then read the UTC date part) gives the correct
 * Nepal calendar date regardless of the process timezone. This is the canonical
 * home for the "platform pattern" also used by reports/report.util.ts.
 */
export const NEPAL_OFFSET_MS = 345 * 60 * 1000;
export function todayAdInNepal(): string {
  return new Date(Date.now() + NEPAL_OFFSET_MS).toISOString().slice(0, 10);
}
