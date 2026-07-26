import { buildInvoiceSequenceKey, buildInvoiceNumber, fiscalYearBs } from '../bill-post.util';

describe('bill-post.util', () => {
  describe('buildInvoiceSequenceKey', () => {
    it('CONTINUOUS: builds the R13-shaped key with a stable, non-year segment', () => {
      expect(buildInvoiceSequenceKey('demo', false, 2083)).toBe('bill_invoice:demo:CONTINUOUS');
    });

    it('CONTINUOUS: is stable across a fiscal-year boundary (never resets)', () => {
      expect(buildInvoiceSequenceKey('demo', false, 2082)).toBe(buildInvoiceSequenceKey('demo', false, 2083));
    });

    it('RESET: the key advances with the fiscal year', () => {
      expect(buildInvoiceSequenceKey('demo', true, 2082)).toBe('bill_invoice:demo:2082');
      expect(buildInvoiceSequenceKey('demo', true, 2083)).toBe('bill_invoice:demo:2083');
      expect(buildInvoiceSequenceKey('demo', true, 2082)).not.toBe(buildInvoiceSequenceKey('demo', true, 2083));
    });

    it('differs per tenant slug', () => {
      expect(buildInvoiceSequenceKey('demo', false, 2083)).not.toBe(buildInvoiceSequenceKey('motherland-school', false, 2083));
    });
  });

  describe('fiscalYearBs', () => {
    it('Baisakh-Ashadh (months 1-3) belong to the PREVIOUS fiscal year', () => {
      expect(fiscalYearBs(2083, 1)).toBe(2082);
      expect(fiscalYearBs(2083, 2)).toBe(2082);
      expect(fiscalYearBs(2083, 3)).toBe(2082);
    });

    it('Shrawan (month 4) onward belongs to the CURRENT fiscal year', () => {
      expect(fiscalYearBs(2083, 4)).toBe(2083);
      expect(fiscalYearBs(2083, 12)).toBe(2083);
    });
  });

  describe('buildInvoiceNumber', () => {
    it('pads the sequence value to 6 digits', () => {
      expect(buildInvoiceNumber(2083, 1)).toBe('BINV-2083-000001');
    });

    it('handles a bigint sequence value (Postgres BIGINT column)', () => {
      expect(buildInvoiceNumber(2083, BigInt(42))).toBe('BINV-2083-000042');
    });

    it('does not truncate a 6+ digit sequence value', () => {
      expect(buildInvoiceNumber(2083, 1234567)).toBe('BINV-2083-1234567');
    });
  });
});
