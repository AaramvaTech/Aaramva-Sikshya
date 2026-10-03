import { describe, it, expect } from 'vitest';
import { nepalDateOf, nepalTodayAd, adDateOfTimestamp, addDaysAd } from '../nepal-date';

describe('nepalDateOf', () => {
  it('is the NEXT day for the UTC evening before Nepal midnight (18:15Z = 00:00 Nepal)', () => {
    expect(nepalDateOf(new Date('2026-10-02T18:15:00.000Z'))).toBe('2026-10-03');
    expect(nepalDateOf(new Date('2026-10-02T18:14:59.999Z'))).toBe('2026-10-02');
  });
  it('matches UTC for the Nepal daytime', () => {
    expect(nepalDateOf(new Date('2026-10-03T08:00:00.000Z'))).toBe('2026-10-03');
  });
  it('crosses month and year boundaries', () => {
    expect(nepalDateOf(new Date('2026-12-31T20:00:00.000Z'))).toBe('2027-01-01');
  });
  it('nepalTodayAd takes an injectable clock', () => {
    expect(nepalTodayAd(new Date('2026-10-02T19:00:00Z'))).toBe('2026-10-03');
  });
});

describe('adDateOfTimestamp', () => {
  it('keeps a bare date unchanged', () => {
    expect(adDateOfTimestamp('2026-10-03')).toBe('2026-10-03');
  });
  it('converts a timestamp to its Nepal day (00:30 Nepal is still the previous UTC day)', () => {
    expect(adDateOfTimestamp('2026-10-02T19:00:00.000Z')).toBe('2026-10-03');
  });
  it('returns empty for null / garbage', () => {
    expect(adDateOfTimestamp(null)).toBe('');
    expect(adDateOfTimestamp('not a date')).toBe('');
  });
});

describe('addDaysAd', () => {
  it('adds and subtracts across boundaries', () => {
    expect(addDaysAd('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysAd('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDaysAd('2028-02-28', 1)).toBe('2028-02-29');
  });
});
