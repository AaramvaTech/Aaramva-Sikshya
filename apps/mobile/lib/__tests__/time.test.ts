import { describe, it, expect } from '@jest/globals';
import { localDateKey } from '../time';

/**
 * Regression guard for FIX-1 / audit P0-6.
 *
 * localDateKey must key a Date by its LOCAL calendar day. Nepal is UTC+05:45,
 * so between 00:00 and 05:45 Nepal time `Date.toISOString().slice(0, 10)`
 * returns YESTERDAY's date — corrupting any attendance/leave date written in
 * that window. These tests are pinned to TZ=Asia/Kathmandu via the "test"
 * script; the first guard fails loudly if that pin is ever dropped (otherwise
 * the boundary assertions would silently pass or fail by environment).
 */
describe('localDateKey (TZ-safe local date key)', () => {
  it('runs under the Asia/Kathmandu timezone pin (UTC+05:45)', () => {
    // getTimezoneOffset() is minutes behind UTC, negated: +05:45 => -345.
    expect(new Date('2026-07-07T22:00:00.000Z').getTimezoneOffset()).toBe(-345);
  });

  it('keys the early-morning window to the LOCAL Nepal day, not the prior UTC day', () => {
    // 22:00 UTC Jul 7 == 03:45 Jul 8 in Kathmandu.
    const instant = new Date('2026-07-07T22:00:00.000Z');
    expect(localDateKey(instant)).toBe('2026-07-08');
    // The exact bug this replaces: toISOString truncation yields the prior day.
    expect(instant.toISOString().slice(0, 10)).toBe('2026-07-07');
  });

  it('keys exact local midnight correctly (lower edge of the danger window)', () => {
    // 18:15 UTC Jul 7 == 00:00 Jul 8 Kathmandu.
    const localMidnight = new Date('2026-07-07T18:15:00.000Z');
    expect(localDateKey(localMidnight)).toBe('2026-07-08');
    expect(localMidnight.toISOString().slice(0, 10)).toBe('2026-07-07'); // corruption case
  });

  it('keys the instant just before local midnight to the earlier day (upper edge)', () => {
    // 18:14 UTC Jul 7 == 23:59 Jul 7 Kathmandu.
    const justBefore = new Date('2026-07-07T18:14:00.000Z');
    expect(localDateKey(justBefore)).toBe('2026-07-07');
  });

  it('agrees with the UTC date outside the offset window (no off-by-one the other way)', () => {
    // 06:00 UTC Jul 8 == 11:45 Jul 8 Kathmandu — same day either way.
    const instant = new Date('2026-07-08T06:00:00.000Z');
    expect(localDateKey(instant)).toBe('2026-07-08');
    expect(instant.toISOString().slice(0, 10)).toBe('2026-07-08');
  });

  it('zero-pads single-digit month and day', () => {
    // 03:00 UTC == 08:45 local, same day.
    expect(localDateKey(new Date('2026-03-05T03:00:00.000Z'))).toBe('2026-03-05');
  });
});
