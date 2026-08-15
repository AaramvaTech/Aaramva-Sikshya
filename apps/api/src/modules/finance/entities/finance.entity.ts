import { Money } from '../../../common/money/money';

/**
 * BILLING-CUTOVER Phase 4: this file used to also hold old Finance's own
 * Row/ResponseDto types and mappers (fee categories/structures/invoices/
 * payments) — all deleted along with the old rail. What's left here,
 * `toAdString` and `toMoney`, are genuinely shared: nearly every Billing-rail
 * service (bill-payment/bill-invoice/bill-correction/bill-fine/ledger/
 * cashier-shift/fee-preview/opening-balance-import/esewa/khalti/…) and the
 * REP-1 reports module import `toMoney` from here. The filename predates
 * that shared role; kept in place rather than renamed to avoid a ~20-file
 * import-path sweep for a rename with no behavior change.
 */

export function toAdString(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().split('T')[0];
}

/**
 * BILL-0 (R1): the one place a raw NUMERIC DB value (Prisma hands raw-query
 * NUMERIC columns back as strings) becomes a Money. Replaces the old `toNum`
 * (parseFloat-based) everywhere in the finance module — call `.toNumber()`
 * on the result only at a genuine boundary (a response DTO field, a SQL
 * param), never mid-computation.
 */
export function toMoney(v: string | number | null | undefined): Money {
  if (v == null) return Money.zero();
  return typeof v === 'number' ? Money.fromNumber(v) : Money.fromDb(v);
}
