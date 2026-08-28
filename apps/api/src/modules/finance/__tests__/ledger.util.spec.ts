import { parseAdDateString, bsOf, directionToDebitCredit, openingBalanceCutoffExpr, ledgerBalanceSql } from '../ledger.util';

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

  // D19 — the fiscal-year rollover fix. These are shape/substring checks
  // (no real Postgres in a unit test), proving the SQL a caller sends
  // actually contains the floor logic; the concrete double-count scenario
  // is proven against a real DB in the discovery/verification report, not
  // here — same split this codebase already uses for reversedExpr etc.
  describe('openingBalanceCutoffExpr', () => {
    it('scopes the MAX(entry_date) subquery to OPENING_BALANCE entries for the given student reference', () => {
      const expr = openingBalanceCutoffExpr('$1::uuid');
      expect(expr).toContain('MAX(entry_date)');
      expect(expr).toContain("entry_type = 'OPENING_BALANCE'");
      expect(expr).toContain('student_id = $1::uuid');
    });

    it('degrades to -infinity when no OPENING_BALANCE entry exists — the Year-1-safety guarantee', () => {
      const expr = openingBalanceCutoffExpr('$1::uuid');
      expect(expr).toContain("COALESCE(");
      expect(expr).toContain("'-infinity'::date");
    });

    it('uses whatever SQL reference the caller supplies, not a hardcoded param position', () => {
      const expr = openingBalanceCutoffExpr('bc.student_id');
      expect(expr).toContain('student_id = bc.student_id');
      expect(expr).not.toContain('$1');
    });
  });

  describe('ledgerBalanceSql', () => {
    it('sums debit-credit floored at the opening-balance cutoff, for the given student reference', () => {
      const sql = ledgerBalanceSql('$1::uuid');
      expect(sql).toContain('SUM(debit) - SUM(credit)');
      expect(sql).toContain('WHERE student_id = $1::uuid');
      expect(sql).toContain('entry_date >=');
      expect(sql).toContain("entry_type = 'OPENING_BALANCE'");
    });
  });
});
