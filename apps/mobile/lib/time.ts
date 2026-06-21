/**
 * Wall-clock formatting for timetable period times.
 *
 * Period start/end are stored as plain time-of-day ("10:00"). The backend may
 * serialise them either as a clean string ("10:00" / "10:00:00") OR — when the
 * PG `time` column comes back through the driver as a Date — as a full
 * `Date.toString()` like "Thu Jan 01 1970 15:30:00 GMT+0530 (Nepal Time)".
 *
 * Either way these are WALL-CLOCK times, not instants: never apply a device
 * timezone offset. We read the hour/minute components directly. For the
 * Date-string case the wall-clock survives in the UTC components (the "+0530"
 * offset only exists because midnight-UTC 10:00 was shifted for display), so we
 * read getUTCHours/getUTCMinutes to recover the original "10:00".
 */

function parseHm(raw: string): { h: number; m: number } | null {
  if (!raw) return null;

  // Clean "HH:MM" / "HH:MM:SS" string → use components verbatim.
  const m = /^(\d{1,2}):(\d{2})/.exec(raw.trim());
  if (m) return { h: Number(m[1]), m: Number(m[2]) };

  // Stringified Date ("Thu Jan 01 1970 15:30:00 GMT+0530 …") → recover the
  // wall-clock from the UTC components (no offset applied).
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return { h: d.getUTCHours(), m: d.getUTCMinutes() };

  return null;
}

/** 24-hour wall clock, e.g. "10:00". Used for the Routine start–end range. */
export function formatPeriodTime(raw: string): string {
  const hm = parseHm(raw);
  if (!hm) return '';
  return `${String(hm.h).padStart(2, '0')}:${String(hm.m).padStart(2, '0')}`;
}

/** 12-hour wall clock with meridiem, e.g. "10:00 AM". Used on the Home card. */
export function formatPeriodTime12(raw: string): string {
  const hm = parseHm(raw);
  if (!hm) return '';
  const meridiem = hm.h < 12 ? 'AM' : 'PM';
  const h12 = hm.h % 12 === 0 ? 12 : hm.h % 12;
  return `${h12}:${String(hm.m).padStart(2, '0')} ${meridiem}`;
}

/** Start–end range for the Routine time rail, e.g. "10:00 – 10:45". */
export function formatPeriodRange(start: string, end: string): string {
  return `${formatPeriodTime(start)} – ${formatPeriodTime(end)}`;
}

/**
 * Local-calendar Y-M-D key ("yyyy-mm-dd"). TZ-safe, unlike `Date.toISOString()`,
 * which shifts a local-midnight date to the PREVIOUS UTC day on positive offsets
 * (e.g. Nepal +05:45) — misaligning BS calendar cells against the backend's
 * AD date keys. Use this when matching a bsToAd() date to an attendance record.
 */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
