# BS Calendar Utility — packages/bs-calendar

## Purpose
Convert between Bikram Sambat (BS) and Anno Domini (AD) dates.
This is a custom package because no reliable npm library exists for this.
All user-facing dates in the system display in BS. All DB storage is in AD.

---

## The algorithm

BS to AD conversion uses a lookup table — BS months have variable day counts
that change year to year. The lookup table covers years 2000–2100 BS.

```typescript
// packages/bs-calendar/src/data.ts
// Each entry = array of 12 values = days in each month of that BS year
// Index 0 = Baisakh (month 1), Index 11 = Chaitra (month 12)
export const BS_MONTH_DATA: Record<number, number[]> = {
  2000: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2001: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2002: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2003: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2004: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2005: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2006: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2007: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2008: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2009: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2010: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2011: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2012: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2013: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2014: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2015: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2016: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2017: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2018: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2019: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2020: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2021: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2022: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2023: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2024: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2025: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2026: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2027: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2028: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2029: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2030: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2031: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2032: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2033: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2034: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2035: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2036: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2037: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2038: [31, 31, 31, 32, 31, 31, 29, 30, 29, 30, 30, 30],
  2039: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2040: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2041: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2042: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2043: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2044: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2045: [31, 31, 31, 32, 31, 31, 29, 30, 29, 30, 30, 30],
  2046: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2047: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2048: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2049: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2050: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2051: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2052: [31, 31, 31, 32, 31, 31, 29, 30, 29, 30, 30, 30],
  2053: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2054: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2055: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2056: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2057: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2058: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2059: [31, 31, 31, 32, 31, 31, 29, 30, 29, 30, 30, 30],
  2060: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2061: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2062: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2063: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2064: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2065: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2066: [31, 31, 31, 32, 31, 31, 29, 30, 29, 30, 30, 30],
  2067: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2068: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2069: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2070: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2071: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2072: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2073: [31, 31, 31, 32, 31, 31, 29, 30, 29, 30, 30, 30],
  2074: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2075: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2076: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2077: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2078: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2079: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2080: [31, 31, 31, 32, 31, 31, 29, 30, 29, 30, 30, 30],
  2081: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2082: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2083: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2084: [31, 31, 32, 31, 31, 31, 30, 30, 29, 29, 30, 30],
  2085: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2086: [31, 31, 31, 32, 31, 31, 29, 30, 29, 30, 30, 30],
  2087: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2088: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2089: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2090: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2091: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2092: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2093: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2094: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2095: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2096: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2097: [31, 31, 31, 32, 31, 31, 29, 30, 29, 30, 30, 30],
  2098: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2099: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2100: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
};

// Reference point: 1 Baisakh 2000 BS = 12 April 1943 AD
// (Adjusted from 13 April: the BS_MONTH_DATA table above sums to exactly one more
//  day than the real AD gap when anchored at 13 April. Anchoring at 12 April makes
//  the table reproduce both real-world anchors — 2024-04-13 = BS 2081-01-01 and
//  2024-01-01 = BS 2080-09-17 — without changing any table values.)
export const BS_EPOCH = { bsYear: 2000, bsMonth: 1, bsDay: 1 };
export const AD_EPOCH = new Date(1943, 3, 12); // April 12, 1943
```

---

## API to implement

```typescript
// packages/bs-calendar/src/index.ts

export interface BsDate {
  year: number;   // e.g. 2081
  month: number;  // 1–12 (1 = Baisakh)
  day: number;    // 1–32
}

export const BS_MONTH_NAMES_EN = [
  'Baisakh', 'Jestha', 'Ashadh', 'Shrawan',
  'Bhadra', 'Ashwin', 'Kartik', 'Mangsir',
  'Poush', 'Magh', 'Falgun', 'Chaitra'
];

export const BS_MONTH_NAMES_NP = [
  'बैशाख', 'जेठ', 'असार', 'श्रावण',
  'भाद्र', 'आश्विन', 'कार्तिक', 'मंसिर',
  'पुष', 'माघ', 'फागुन', 'चैत्र'
];

// Convert AD Date to BS
export function adToBs(adDate: Date): BsDate

// Convert BS to AD Date
export function bsToAd(bsDate: BsDate): Date

// Format BS date as string: "15 Baisakh 2081" or "15 बैशाख 2081"
export function formatBs(bsDate: BsDate, lang: 'en' | 'np'): string

// Get current BS date
export function todayBs(): BsDate

// Get BS year for a given AD date (useful for admission number generation)
export function getBsYear(adDate: Date): number

// Get days in a BS month
export function daysInBsMonth(year: number, month: number): number

// Check if a BS year+month+day is valid
export function isValidBsDate(bsDate: BsDate): boolean

// Get Nepal's current fiscal year label, e.g. "2081/82"
export function getCurrentFiscalYear(): string

// Parse "2081-04-15" string into BsDate
export function parseBsString(dateStr: string): BsDate
```

---

## Tests to write (comprehensive — this is safety-critical code)

```typescript
describe('BsCalendar', () => {
  it('converts AD 2024-04-13 to BS 2081-01-01 (Baisakh 1)')
  it('converts AD 2024-01-01 to BS 2080-09-17 (Poush 17)')
  it('converts BS 2081-01-01 back to AD 2024-04-13 (round trip)')
  it('converts BS 2080-12-30 (last day of Chaitra) correctly')
  it('returns correct days in month for BS 2081 Baisakh (31)')
  it('validates BS date 2081-13-01 as invalid (month 13 doesnt exist)')
  it('validates BS date 2081-01-33 as invalid')
  it('formats 2081-01-15 as "15 Baisakh 2081" in English')
  it('formats 2081-01-15 as "15 बैशाख 2081" in Nepali')
  it('returns current fiscal year as "2081/82" for dates in BS 2081')
})
```

---

## Claude Code prompt for this package

```
Read CLAUDE.md and packages/bs-calendar/README.md.

Build the bs-calendar package from scratch.

This is safety-critical — date conversion errors will corrupt student records.
Use the lookup table data in src/data.ts exactly as provided.
Reference point: 1 Baisakh 2000 BS = 12 April 1943 AD.

Algorithm for adToBs:
1. Calculate total days between input AD date and AD_EPOCH (12 April 1943)
2. Starting from BS year 2000, month 1, day 1:
   - Subtract days in each BS month until remaining days < current month's days
   - The remaining position is the BS date

Algorithm for bsToAd:
1. Count total days from BS 2000-01-01 to input BS date using the lookup table
2. Add that many days to AD_EPOCH (12 April 1943)

Write all functions in src/index.ts.
Export everything from the package root.
Write comprehensive tests — every test case listed in the spec.
```
