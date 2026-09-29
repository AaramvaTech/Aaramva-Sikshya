import { describe, it, expect } from 'vitest';
import { bsToAd, todayBs } from 'bs-calendar';
import { bsYearRange, toLocalAdString, BS_TABLE_MAX_YEAR, BS_TABLE_MIN_YEAR } from '../bs-year-range';

describe('bsYearRange', () => {
  it('default window includes the current BS year and the next one, newest first', () => {
    const y = todayBs().year;
    const years = bsYearRange(y);
    expect(years).toContain(y);
    expect(years).toContain(y + 1);
    expect(years[0]).toBe(y + 5);
    expect(years[years.length - 1]).toBe(y - 10);
    expect([...years].sort((a, b) => b - a)).toEqual(years);
  });

  it('is computed from the given year, not hardcoded (2081 was the old ceiling)', () => {
    expect(bsYearRange(2083)).toContain(2084);
    expect(bsYearRange(2090)[0]).toBe(2095);
  });

  it('never offers a year bs-calendar cannot convert', () => {
    expect(Math.max(...bsYearRange(2098))).toBe(BS_TABLE_MAX_YEAR);
    expect(Math.min(...bsYearRange(2003))).toBe(BS_TABLE_MIN_YEAR);
    for (const y of bsYearRange(2098)) expect(() => bsToAd({ year: y, month: 12, day: 1 })).not.toThrow();
  });

  it('explicit min/max still win (birth-date pickers, ±1 pickers), clamped to the table', () => {
    expect(bsYearRange(2083, 2082, 2084)).toEqual([2084, 2083, 2082]);
    expect(bsYearRange(2083, 1990, 2200)).toHaveLength(BS_TABLE_MAX_YEAR - BS_TABLE_MIN_YEAR + 1);
  });
});

describe('toLocalAdString', () => {
  it('1 Shrawan 2083 → 2026-07-17 in any TZ (toISOString().split gave 2026-07-16 under UTC+5:45)', () => {
    expect(toLocalAdString(bsToAd({ year: 2083, month: 4, day: 1 }))).toBe('2026-07-17');
  });
  it('2081 Baisakh 1 → 2024-04-13 (the day the buggy picker stored as 2024-04-12)', () => {
    expect(toLocalAdString(bsToAd({ year: 2081, month: 1, day: 1 }))).toBe('2024-04-13');
  });
});
