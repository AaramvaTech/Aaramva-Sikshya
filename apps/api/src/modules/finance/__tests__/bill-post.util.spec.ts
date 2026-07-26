import { buildInvoiceSequenceKey, buildInvoiceNumber } from '../bill-post.util';

describe('bill-post.util', () => {
  describe('buildInvoiceSequenceKey', () => {
    it('builds the R13-shaped key, CONTINUOUS-only (see BILL-BUGS.md)', () => {
      expect(buildInvoiceSequenceKey('demo')).toBe('bill_invoice:demo:CONTINUOUS');
    });

    it('is stable across repeated calls for the same tenant (never resets)', () => {
      expect(buildInvoiceSequenceKey('demo')).toBe(buildInvoiceSequenceKey('demo'));
    });

    it('differs per tenant slug', () => {
      expect(buildInvoiceSequenceKey('demo')).not.toBe(buildInvoiceSequenceKey('motherland-school'));
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
