import { printLabel, resolvePrintLanguage } from '../bill-print-labels';

describe('printLabel', () => {
  it('EN returns the English string', () => {
    expect(printLabel('invoice', 'EN')).toBe('Invoice');
  });
  it('NE returns the Nepali string', () => {
    expect(printLabel('invoice', 'NE')).toBe('बिल');
  });
  it('BOTH returns "English / Nepali"', () => {
    expect(printLabel('invoice', 'BOTH')).toBe('Invoice / बिल');
  });
});

describe('resolvePrintLanguage — B8-6 gate, defensive at render time', () => {
  it('defaults to EN for null', () => {
    expect(resolvePrintLanguage(null)).toBe('EN');
  });

  it('defaults to EN for undefined', () => {
    expect(resolvePrintLanguage(undefined)).toBe('EN');
  });

  it('falls back to EN for a garbage value', () => {
    expect(resolvePrintLanguage('FR')).toBe('EN');
  });

  // BILL-PRINT-1 CLOSED the gate again: this ticket added ~20 new Nepali keys
  // that the 2026-07-30 review never saw, so BILL_PRINT_1_NEPALI_REVIEWED is
  // false and NEPALI_PRINT_PERMITTED (both flags) is false.
  //
  // These two cases previously asserted the OPEN state. They now assert the
  // CLOSED one, and they are written to fail loudly when the flag flips — that
  // is deliberate: flipping a review gate should require touching its tests,
  // so it cannot happen as a side effect of an unrelated change. When the
  // native-speaker review comes back, restore the `.toBe('NE')` /
  // `.toBe('BOTH')` expectations in the same commit that flips the flag.
  it('NE/BOTH fall back to EN while the BILL-PRINT-1 keyset is unreviewed', () => {
    expect(resolvePrintLanguage('NE')).toBe('EN');
    expect(resolvePrintLanguage('BOTH')).toBe('EN');
  });

  it('a staff query override cannot bypass the review gate either', () => {
    // The override is a staff convenience, not an authorisation to ship
    // unreviewed Devanagari to a parent.
    expect(resolvePrintLanguage('EN', 'NE')).toBe('EN');
  });

  it('override wins over the stored default when both are valid (EN case)', () => {
    expect(resolvePrintLanguage('EN', 'EN')).toBe('EN');
  });
});
