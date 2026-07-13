import { bsToAd, parseBsString } from 'bs-calendar';
import { formatLocalDate, todayAdInNepal } from '../date.util';

/**
 * FIX-2 — TZ-independent BS→AD conversion formatting.
 *
 * bsToAd() builds its Date in the LOCAL frame, so formatLocalDate (local
 * components) is TZ-independent by construction, while the old
 * toISOString().split('T')[0] shifted the day back under UTC+ timezones.
 * The decisive proof is the full suite passing under BOTH TZ=Asia/Kathmandu
 * and TZ=UTC (CI runs Asia/Kathmandu; run `TZ=UTC npm test` locally for the
 * other frame — a single jest process cannot switch TZ mid-run).
 *
 * Expected values below are verified against the bs-calendar LOOKUP TABLE.
 * Authoritative spot-check (nepalicalendar.rat32.com, checked 2026-07-11):
 *   - 27 Ashadh 2083 = 2026-07-11 ✓ (today — modern era CONFIRMED correct)
 *   - 1 Baisakh 2080 = 2023-04-14 ✓ CONFIRMED
 *   - 1 Baisakh 2070 = authority says 2013-04-14, table yields 2013-04-13;
 *     15 Bhadra 2070 = authority says 2013-08-31, table yields 2013-08-30.
 *     ⚠️ The table is one day off in the 2070 era (FIX-3, open) — these tests
 *     deliberately key to the TABLE so they test the formatter, not the table;
 *     FIX-3's table correction should update the 2070-era vectors here.
 */
describe('formatLocalDate (FIX-2)', () => {
  const convert = (bs: string) => formatLocalDate(bsToAd(parseBsString(bs)));

  it('formats BS→AD dates from local components (the CI-failure vector)', () => {
    // This exact conversion produced 2013-08-29 under Nepal TZ pre-fix.
    expect(convert('2070-05-15')).toBe('2013-08-30');
  });

  it('modern-era anchors (authority-confirmed)', () => {
    expect(convert('2083-03-27')).toBe('2026-07-11'); // today at time of writing ✓
    expect(convert('2080-01-01')).toBe('2023-04-14'); // Nepali New Year 2080 ✓
  });

  it('year rollover: last Chaitra 2082 → 1 Baisakh 2083 are consecutive days', () => {
    expect(convert('2082-12-31')).toBe('2026-04-13'); // Chaitra 2082 has 31 days
    expect(convert('2083-01-01')).toBe('2026-04-14');
  });

  it('AD year boundary lands mid-BS-month', () => {
    expect(convert('2083-09-17')).toBe('2027-01-01');
  });

  it('epoch start of the lookup table', () => {
    // Table yields 1943-04-12; the package error message says the range starts
    // 13 April 1943 — an internal off-by-one recorded under FIX-3.
    expect(convert('2000-01-01')).toBe('1943-04-12');
  });

  it('zero-pads single-digit months and days', () => {
    expect(formatLocalDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('is a pure local-component read (construction frame in = same frame out)', () => {
    // A local-frame construction formats to the same components in ANY process
    // TZ — this is what toISOString() violated for UTC+ zones.
    expect(formatLocalDate(new Date(2013, 7, 30))).toBe('2013-08-30');
  });
});

/**
 * QA-1 OBS-E — todayAdInNepal() returns the Asia/Kathmandu calendar date, not
 * UTC-today. The decisive case is just after Nepal midnight, while UTC is still
 * on the previous day.
 */
describe('todayAdInNepal (QA-1 OBS-E)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses the Nepal date at 2026-07-14 00:30 +05:45 (UTC is still 2026-07-13)', () => {
    // 2026-07-13T18:45:00Z  ==  2026-07-14T00:30:00+05:45
    const instant = Date.UTC(2026, 6, 13, 18, 45, 0);
    jest.spyOn(Date, 'now').mockReturnValue(instant);

    // Sanity: the OLD (buggy) UTC-today would report the previous Nepal day.
    expect(new Date(Date.now()).toISOString().slice(0, 10)).toBe('2026-07-13');

    // The fix: Nepal date is 2026-07-14.
    expect(todayAdInNepal()).toBe('2026-07-14');
  });

  it('agrees with UTC when Nepal and UTC are on the same calendar day (midday)', () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 6, 13, 6, 0, 0)); // 11:45 Nepal
    expect(todayAdInNepal()).toBe('2026-07-13');
  });
});
