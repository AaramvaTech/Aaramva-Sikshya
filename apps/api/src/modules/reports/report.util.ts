import { BadRequestException } from '@nestjs/common';
import { adToBs, bsToAd, todayBs, BS_MONTH_NAMES_EN } from 'bs-calendar';

/**
 * REP-1 shared helpers.
 *
 * BS-month bucketing approach (Step-0-verified): SQL aggregates per AD day
 * (DATE column, index-aligned); the service folds day rows into BS months
 * here. The AD→BS chain is FIX-2-compliant: DB DATE → toISOString date part →
 * components → local-frame Date (adToBs's epoch math is local-frame) → adToBs.
 * No SQL-side BS math. FIX-3 caveat: the 2070-era table is off-by-one, but
 * operational data is current-era (verified anchor 2026-07-11 = 27 Ashadh 2083).
 */

/** DB DATE (UTC-frame Date) or 'YYYY-MM-DD' string → BS bucket key + label. */
export function bsMonthBucket(adDate: Date | string): { key: string; label: string } {
  const iso = typeof adDate === 'string' ? adDate : adDate.toISOString().slice(0, 10);
  const [y, m, d] = iso.split('-').map(Number);
  const bs = adToBs(new Date(y, m - 1, d));
  return {
    key: `${bs.year}-${String(bs.month).padStart(2, '0')}`,
    label: `${BS_MONTH_NAMES_EN[bs.month - 1]} ${bs.year}`,
  };
}

/** ISO date part of a DB DATE value (FIX-2: UTC-frame round-trip is correct). */
export function isoDate(d: Date | string): string {
  return typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}

/** Today as an AD 'YYYY-MM-DD' in Asia/Kathmandu (offset arithmetic — the
 *  platform pattern; no local-frame assumptions). */
const NEPAL_OFFSET_MS = 345 * 60 * 1000;
export function todayAdInNepal(): string {
  return new Date(Date.now() + NEPAL_OFFSET_MS).toISOString().slice(0, 10);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The bounded-range guard every report endpoint runs: validates AD inputs,
 * defaults to the current BS year (1 Baishakh..today), caps at ~2 years.
 */
export function resolveRange(from?: string, to?: string): { from: string; to: string } {
  if ((from && !ISO_DATE_RE.test(from)) || (to && !ISO_DATE_RE.test(to))) {
    throw new BadRequestException('from/to must be AD dates in YYYY-MM-DD form.');
  }
  let resolvedTo = to ?? todayAdInNepal();
  let resolvedFrom = from;
  if (!resolvedFrom) {
    // Default: start of the current BS year.
    const bsNow = todayBs();
    const baisakh1 = bsToAd({ year: bsNow.year, month: 1, day: 1 });
    resolvedFrom = `${baisakh1.getFullYear()}-${String(baisakh1.getMonth() + 1).padStart(2, '0')}-${String(baisakh1.getDate()).padStart(2, '0')}`;
  }
  if (resolvedFrom > resolvedTo) {
    throw new BadRequestException('from must not be after to.');
  }
  const spanMs = Date.parse(`${resolvedTo}T00:00:00Z`) - Date.parse(`${resolvedFrom}T00:00:00Z`);
  if (spanMs > 2 * 366 * 24 * 3600 * 1000) {
    throw new BadRequestException('Date range too large — maximum two years per report.');
  }
  return { from: resolvedFrom, to: resolvedTo };
}

/** Postgres numeric → number (finance report convention). */
export function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : parseFloat(v);
}

/** Rate helper: percent with one decimal, 0 when the denominator is 0. */
export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}
