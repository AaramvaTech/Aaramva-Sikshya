import { BadRequestException } from '@nestjs/common';
import { bsMonthBucket, pct, resolveRange } from '../report.util';
import { bucketForDays } from '../fee-aging-report.service';

describe('bsMonthBucket (the Step-0-verified AD→BS fold)', () => {
  it('matches the verified modern-era anchor (2026-07-11 = 27 Ashadh 2083)', () => {
    expect(bsMonthBucket('2026-07-11')).toEqual({ key: '2083-03', label: 'Ashadh 2083' });
  });

  it('splits cleanly at the BS month boundary (1 Shrawan 2083 = 2026-07-16)', () => {
    expect(bsMonthBucket('2026-07-15').key).toBe('2083-03'); // 31 Ashadh
    expect(bsMonthBucket('2026-07-16').key).toBe('2083-04'); // 1 Shrawan
  });

  it('crosses the BS YEAR boundary correctly (Chaitra 2082 → Baishakh 2083)', () => {
    // 1 Baishakh 2083 (BS new year) fell on 2026-04-14.
    expect(bsMonthBucket('2026-04-13')).toEqual({ key: '2082-12', label: 'Chaitra 2082' });
    expect(bsMonthBucket('2026-04-14')).toEqual({ key: '2083-01', label: 'Baisakh 2083' });
  });

  it('accepts DB DATE values (UTC-frame Date objects) identically', () => {
    expect(bsMonthBucket(new Date('2026-07-11T00:00:00.000Z')).key).toBe('2083-03');
  });
});

describe('resolveRange (the bounded-range guard)', () => {
  it('rejects malformed dates', () => {
    expect(() => resolveRange('12-07-2026', undefined)).toThrow(BadRequestException);
    expect(() => resolveRange(undefined, 'yesterday')).toThrow(BadRequestException);
  });

  it('rejects an inverted range', () => {
    expect(() => resolveRange('2026-07-12', '2026-07-01')).toThrow(BadRequestException);
  });

  it('rejects a range beyond two years', () => {
    expect(() => resolveRange('2020-01-01', '2026-07-12')).toThrow(/two years/);
  });

  it('passes through an explicit valid range', () => {
    expect(resolveRange('2026-06-01', '2026-07-12')).toEqual({
      from: '2026-06-01',
      to: '2026-07-12',
    });
  });

  it('defaults to a sane current-BS-year window (from ≤ to, both ISO)', () => {
    const { from, to } = resolveRange(undefined, undefined);
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(from <= to).toBe(true);
  });
});

describe('bucketForDays (aging boundaries — the 30/31 rule)', () => {
  it('due today / not yet due is CURRENT (no bucket)', () => {
    expect(bucketForDays(0)).toBeNull();
    expect(bucketForDays(-5)).toBeNull();
  });
  it('boundary days land exactly per spec', () => {
    expect(bucketForDays(1)).toBe('0-30');
    expect(bucketForDays(30)).toBe('0-30');
    expect(bucketForDays(31)).toBe('31-60');
    expect(bucketForDays(60)).toBe('31-60');
    expect(bucketForDays(61)).toBe('61-90');
    expect(bucketForDays(90)).toBe('61-90');
    expect(bucketForDays(91)).toBe('90+');
    expect(bucketForDays(365)).toBe('90+');
  });
});

describe('pct', () => {
  it('rounds to one decimal and survives zero denominators', () => {
    expect(pct(2, 3)).toBe(66.7);
    expect(pct(0, 0)).toBe(0);
    expect(pct(5, 5)).toBe(100);
  });
});
