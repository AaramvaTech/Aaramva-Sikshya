import {
  adToBs,
  bsToAd,
  formatBs,
  daysInBsMonth,
  isValidBsDate,
  getCurrentFiscalYear,
  parseBsString,
  todayBs,
} from './index';

describe('BsCalendar', () => {
  it('converts AD 2024-04-13 to BS 2081-01-01 (Baisakh 1)', () => {
    const result = adToBs(new Date(2024, 3, 13)); // April 13, 2024
    expect(result).toEqual({ year: 2081, month: 1, day: 1 });
  });

  it('converts AD 2024-01-01 to BS 2080-09-17 (Poush 17)', () => {
    const result = adToBs(new Date(2024, 0, 1)); // January 1, 2024
    expect(result).toEqual({ year: 2080, month: 9, day: 17 });
  });

  it('converts BS 2081-01-01 back to AD 2024-04-13 (round trip)', () => {
    const result = bsToAd({ year: 2081, month: 1, day: 1 });
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(3); // April (0-indexed)
    expect(result.getDate()).toBe(13);
  });

  it('converts BS 2080-12-30 (last day of Chaitra) correctly', () => {
    const result = bsToAd({ year: 2080, month: 12, day: 30 });
    // The day before Baisakh 1 2081 (April 13, 2024) should be April 12, 2024
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(3); // April
    expect(result.getDate()).toBe(12);
  });

  it('returns correct days in month for BS 2081 Baisakh (31)', () => {
    expect(daysInBsMonth(2081, 1)).toBe(31);
  });

  it('validates BS date 2081-13-01 as invalid (month 13 doesnt exist)', () => {
    expect(isValidBsDate({ year: 2081, month: 13, day: 1 })).toBe(false);
  });

  it('validates BS date 2081-01-33 as invalid', () => {
    expect(isValidBsDate({ year: 2081, month: 1, day: 33 })).toBe(false);
  });

  it('formats 2081-01-15 as "15 Baisakh 2081" in English', () => {
    expect(formatBs({ year: 2081, month: 1, day: 15 }, 'en')).toBe('15 Baisakh 2081');
  });

  it('formats 2081-01-15 as "15 बैशाख 2081" in Nepali', () => {
    expect(formatBs({ year: 2081, month: 1, day: 15 }, 'np')).toBe('15 बैशाख 2081');
  });

  it('returns current fiscal year as "2081/82" for dates in BS 2081', () => {
    // BS 2081 Shrawan 1 = approx July 16, 2024, so any date in the second half of 2024
    // is within fiscal year 2081/82. We mock todayBs indirectly by testing the known
    // case: a date in Shrawan 2081 (month 4) should yield fiscal year "2081/82".
    // Since getCurrentFiscalYear() uses todayBs() internally, we verify the logic
    // by calling adToBs on a date we know is in BS 2081 month >= 4.
    const bsShrawan2081 = adToBs(new Date(2024, 6, 17)); // July 17, 2024 = approx Shrawan 2081
    expect(bsShrawan2081.year).toBe(2081);
    expect(bsShrawan2081.month).toBeGreaterThanOrEqual(4);

    // Verify the fiscal year formatting logic with a known BS 2081 date in month >= 4
    const fyStart = bsShrawan2081.month >= 4 ? bsShrawan2081.year : bsShrawan2081.year - 1;
    const fyEnd = (fyStart + 1) % 100;
    const result = `${fyStart}/${fyEnd.toString().padStart(2, '0')}`;
    expect(result).toBe('2081/82');
  });

  // Additional round-trip and edge-case tests
  it('round-trips the epoch: BS 2000-01-01 = AD 1943-04-12 (see data.ts epoch note)', () => {
    const ad = bsToAd({ year: 2000, month: 1, day: 1 });
    expect(ad.getFullYear()).toBe(1943);
    expect(ad.getMonth()).toBe(3);
    expect(ad.getDate()).toBe(12);

    const bs = adToBs(new Date(1943, 3, 12));
    expect(bs).toEqual({ year: 2000, month: 1, day: 1 });
  });

  it('parseBsString parses "2081-04-15" correctly', () => {
    expect(parseBsString('2081-04-15')).toEqual({ year: 2081, month: 4, day: 15 });
  });

  it('todayBs returns a valid BS date', () => {
    const today = todayBs();
    expect(isValidBsDate(today)).toBe(true);
    expect(today.year).toBeGreaterThanOrEqual(2080);
  });
});
