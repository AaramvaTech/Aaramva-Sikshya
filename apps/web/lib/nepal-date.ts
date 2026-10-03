/**
 * Nepal-calendar-day helpers. Nepal is UTC+05:45 with no DST, so "today in Nepal" and "the Nepal day an
 * instant fell on" can be computed from the UTC epoch alone — independent of the browser's time zone.
 *
 * Why this exists: `new Date().toISOString().split('T')[0]` is the UTC date, which is YESTERDAY in Nepal between
 * 00:00 and 05:45 (the FIX-2 bug class). Same for `timestamp.slice(0, 10)`.
 */
const NEPAL_OFFSET_MIN = 5 * 60 + 45;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** AD `YYYY-MM-DD` of the Nepal calendar day containing `instant` (default: now). */
export function nepalDateOf(instant: Date | number = new Date()): string {
  const t = (instant instanceof Date ? instant.getTime() : instant) + NEPAL_OFFSET_MIN * 60_000;
  const d = new Date(t); // read with UTC getters only: the offset is already applied
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Today's date in Nepal, AD `YYYY-MM-DD`. */
export function nepalTodayAd(now: Date | number = new Date()): string {
  return nepalDateOf(now);
}

/**
 * The Nepal calendar date of an API value: a bare `YYYY-MM-DD` is returned unchanged (it is already a date);
 * a full ISO timestamp is converted to the Nepal day it falls on. Unparseable input returns ''.
 */
export function adDateOfTimestamp(value: string | null | undefined): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const t = Date.parse(value);
  return Number.isNaN(t) ? '' : nepalDateOf(t);
}

/** `YYYY-MM-DD` ± whole days, pure calendar arithmetic (no local time zone involved). */
export function addDaysAd(adDate: string, days: number): string {
  const [y, m, d] = adDate.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
