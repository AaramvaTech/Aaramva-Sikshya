import { adToBs, BsDate } from 'bs-calendar';
import { Money } from '../../common/money/money';

/**
 * FIX-2 discipline: construct a LOCAL-frame Date from an AD 'YYYY-MM-DD'
 * string (never `new Date(string)`, which parses as UTC and can shift the
 * day under Nepal's +05:45 offset) before handing it to adToBs — adToBs's
 * own diffDays reads local getters, so this round-trip is TZ-independent.
 */
export function parseAdDateString(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function bsOf(adDateString: string): BsDate {
  return adToBs(parseAdDateString(adDateString));
}

/** DEBIT/CREDIT direction -> the (debit, credit) pair the CHECK constraints expect. */
export function directionToDebitCredit(amount: string, direction: 'DEBIT' | 'CREDIT'): { debit: string; credit: string } {
  return direction === 'DEBIT' ? { debit: amount, credit: '0' } : { debit: '0', credit: amount };
}

/**
 * The ledger's THREE-way balance convention. Zero is its own state — it is
 * neither a debit nor a credit, and printing "(DR)" beside Rs. 0.00 asserts a
 * debt that does not exist.
 *
 * Extracted from LedgerService.getBalance so the print layer consumes the same
 * rule instead of re-deriving one. A `balance < 0` float test is a SECOND
 * convention and a float comparison; this compares through Money.
 */
export type BalanceSign = 'OWES' | 'ADVANCE' | 'ZERO';

export function balanceSign(balance: Money): BalanceSign {
  const cmp = balance.compare(Money.zero());
  return cmp === 0 ? 'ZERO' : cmp > 0 ? 'OWES' : 'ADVANCE';
}

/**
 * D19 — the one definition of "a student's ledger balance, correctly
 * excluding whatever a fiscal-year rollover's OPENING_BALANCE import already
 * restates." Before this, five call sites (LedgerService.getBalance/
 * reconcile/getStatement, BillRunPostRunnerService's previousBalance,
 * BillCorrectionService.liveBalance) each summed EVERY historical ledger
 * entry unconditionally. The ledger is append-only by design — nothing
 * "closes" a year, a fiscal-year rollover is just an admin importing a fresh
 * OPENING_BALANCE entry for the new academic year (opening-balance-import
 * .service.ts, already built, already guards against a duplicate import for
 * the SAME year). Summing everything unconditionally means that import gets
 * counted on top of the Year-1 entries it already restates — the same
 * carried-forward arrears twice, permanently, the moment the first tenant
 * imports a second year's opening balance. Currently LATENT: no tenant has
 * done that yet.
 *
 * The fix floors every balance query at the student's own most recent
 * OPENING_BALANCE entry, if one exists: entries strictly before that entry's
 * date are excluded from the sum; the OPENING_BALANCE entry itself (and
 * everything from that date forward) is included. No student in this
 * codebase's current data has an OPENING_BALANCE entry for a second year —
 * every real tenant today is Year-1-only — so `MAX(entry_date)` over zero
 * matching rows is NULL, COALESCE degrades the cutoff to `'-infinity'::date`,
 * and `entry_date >= '-infinity'` is true for every row: byte-identical to
 * the unfiltered sum it replaces. Zero behavior change for Year 1.
 *
 * Kept as one shared expression, not five copies, for the same reason
 * bill-own-balance.util.ts and bill-reversal.util.ts exist: a rule
 * duplicated in five places is a rule that eventually disagrees with
 * itself — concretely, fixing getBalance() alone while leaving reconcile()'s
 * own inline copy unfiltered would have the nightly reconciliation job
 * permanently stamp student_account_balances (an explicitly-a-cache table,
 * "single-student reads always recompute the live SQL sum" per getBalance's
 * own doc) back to the WRONG, double-counted figure every night forever —
 * self-inflicted, silent drift between the single-student view (fixed) and
 * every list view that reads the cache (still wrong). Using this same
 * expression in reconcile()'s own truth calculation means the nightly job
 * corrects the cache to the SAME right answer instead.
 *
 * `studentIdRef` is whatever SQL the caller's own query already uses to name
 * the student — usually `$1::uuid`, but bill-run-post-runner's post-lock
 * query uses the same positional param a different call already bound, and
 * BillCorrectionService's liveBalance names its own — matching
 * bill-reversal.util.ts's `reversedExpr(ledgerEntryIdCol: string)` shape
 * rather than hardcoding a param number.
 */
export const openingBalanceCutoffExpr = (studentIdRef: string): string => `COALESCE(
             (SELECT MAX(entry_date) FROM student_ledger_entries
              WHERE student_id = ${studentIdRef} AND entry_type = 'OPENING_BALANCE'),
             '-infinity'::date
           )`;

/** A full `SELECT`-the-balance statement built from the cutoff above, for
 *  the call sites that just want "this student's whole floored balance"
 *  (no additional date window of their own — see getStatement for the one
 *  call site that layers this cutoff onto its OWN `entry_date < from`
 *  window instead of using this convenience wrapper directly). */
export const ledgerBalanceSql = (studentIdRef: string): string => `
    SELECT COALESCE(SUM(debit) - SUM(credit), 0) AS sum
    FROM student_ledger_entries
    WHERE student_id = ${studentIdRef}
      AND entry_date >= ${openingBalanceCutoffExpr(studentIdRef)}`;
