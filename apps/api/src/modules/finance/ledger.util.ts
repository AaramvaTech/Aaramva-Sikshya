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
