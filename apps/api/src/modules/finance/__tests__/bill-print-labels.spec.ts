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

  it('NE/BOTH resolve to themselves now that the review gate is open (B8-6, reviewed 2026-07-30)', () => {
    // NEPALI_PRINT_REVIEWED is true in this codebase state. Flipping it back
    // to false should make this test fail loudly — that's the point.
    expect(resolvePrintLanguage('NE')).toBe('NE');
    expect(resolvePrintLanguage('BOTH')).toBe('BOTH');
  });

  it('a staff query override wins over the stored default', () => {
    expect(resolvePrintLanguage('EN', 'NE')).toBe('NE');
  });

  it('override wins over the stored default when both are valid (EN case)', () => {
    expect(resolvePrintLanguage('EN', 'EN')).toBe('EN');
  });
});
