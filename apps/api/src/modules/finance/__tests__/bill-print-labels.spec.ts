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

  it('NE/BOTH fall back to EN while the review gate is closed — even if somehow stored', () => {
    // NEPALI_PRINT_REVIEWED is false in this codebase state; this test's
    // whole point is failing loudly the day someone flips it without
    // updating this assertion's premise.
    expect(resolvePrintLanguage('NE')).toBe('EN');
    expect(resolvePrintLanguage('BOTH')).toBe('EN');
  });

  it('a staff query override cannot bypass the gate either', () => {
    expect(resolvePrintLanguage('EN', 'NE')).toBe('EN');
  });

  it('override wins over the stored default when both are valid (EN case)', () => {
    expect(resolvePrintLanguage('EN', 'EN')).toBe('EN');
  });
});
