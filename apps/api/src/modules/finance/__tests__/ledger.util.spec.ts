import { parseAdDateString, bsOf, directionToDebitCredit } from '../ledger.util';

describe('ledger.util', () => {
  describe('parseAdDateString', () => {
    it('constructs a local-frame Date from an AD string (no UTC shift)', () => {
      const d = parseAdDateString('2026-04-14');
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(3); // 0-indexed
      expect(d.getDate()).toBe(14);
    });
  });

  describe('bsOf', () => {
    it('converts an AD date string to a BS date', () => {
      const bs = bsOf('2026-04-14');
      expect(bs.year).toBeGreaterThan(2000);
      expect(bs.month).toBeGreaterThanOrEqual(1);
      expect(bs.month).toBeLessThanOrEqual(12);
    });
  });

  describe('directionToDebitCredit', () => {
    it('DEBIT puts the amount on debit, zero on credit', () => {
      expect(directionToDebitCredit('500.00', 'DEBIT')).toEqual({ debit: '500.00', credit: '0' });
    });

    it('CREDIT puts the amount on credit, zero on debit', () => {
      expect(directionToDebitCredit('500.00', 'CREDIT')).toEqual({ debit: '0', credit: '500.00' });
    });

    it('never produces both sides non-zero (mirrors the DB CHECK constraint)', () => {
      const debitCase = directionToDebitCredit('123.45', 'DEBIT');
      const creditCase = directionToDebitCredit('123.45', 'CREDIT');
      expect(debitCase.debit === '0' || debitCase.credit === '0').toBe(true);
      expect(creditCase.debit === '0' || creditCase.credit === '0').toBe(true);
    });
  });
});
