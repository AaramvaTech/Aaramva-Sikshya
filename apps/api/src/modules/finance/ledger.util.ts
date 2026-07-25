import { adToBs, BsDate } from 'bs-calendar';

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
