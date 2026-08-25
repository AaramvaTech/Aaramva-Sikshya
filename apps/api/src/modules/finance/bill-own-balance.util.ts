import { Logger } from '@nestjs/common';
import { Money } from '../../common/money/money';

/**
 * BILL-CHECKOUT-1 — the one definition of "what THIS invoice alone is still
 * owed", and the only figure a payer may be charged at checkout.
 *
 * ALLOCATION-CAP-1 widened its remit: this is also the CEILING on any
 * bill_payment_allocations row booked against the invoice, in every path
 * that writes one. Charging the right figure but still booking the whole
 * payment against one invoice leaves the same defect one layer down — the
 * invoice is over-booked and the earlier months it swallowed stay payable.
 *
 * `net_amount`, never `total_receivable`. `total_receivable` is
 * `net_amount + previous_balance` — a statement-of-account figure that
 * restates the student's whole carried-forward position on every month's
 * bill. Charging it means a parent paying one month's card is asked for
 * every earlier unpaid month too, while those earlier invoices stay
 * separately payable — so the same arrears get collected twice. Confirmed
 * live: demo/Aarav Shrestha, charged 4,260 for a 2,260 invoice on
 * 2026-08-12, then the folded-in 2,000 paid again on its own invoice.
 * See BILLING-CALC-AUDIT-1 D32.
 *
 * Arrears are a fact about a STUDENT, not about an invoice. They stay
 * visible because each unpaid month is already its own card with its own
 * Pay button — the list IS the arrears — and the account-level position
 * comes from the ledger (`GET /finance/students/:id/balance`), never from
 * summing invoices.
 *
 * Kept as shared constants rather than four copied SQL strings for the same
 * reason bill-class-guard.util.ts exists: a rule duplicated in four places
 * is a rule that eventually disagrees with itself.
 */
/**
 * The bare expression, for a HAVING/CASE where an output alias is not
 * visible (Postgres does not resolve SELECT aliases in HAVING).
 * ALLOCATION-CAP-1 needs it in three such places; keeping it one constant is
 * why the SELECT below is built from it rather than repeating the arithmetic.
 */
export const OWN_BALANCE_EXPR = `bi.net_amount - COALESCE(SUM(bpa.amount), 0)`;

export const OWN_BALANCE_SELECT = `${OWN_BALANCE_EXPR} AS own_balance`;

/** Only a CLEARED payment's allocations reduce an invoice's balance — a
 *  PENDING cheque or a VOIDED/BOUNCED payment must not make an invoice look
 *  spoken for (B5-5). Verbatim from the shape BillPaymentService already
 *  uses so the two can't drift. */
export const CLEARED_ALLOCATIONS_JOIN = `LEFT JOIN bill_payment_allocations bpa
         ON bpa.bill_invoice_id = bi.id
         AND EXISTS (SELECT 1 FROM bill_payments bp WHERE bp.id = bpa.bill_payment_id AND bp.status = 'CLEARED')`;

/**
 * Clamp at zero AND log. A negative own balance is not a rounding artifact:
 * it means this invoice's cleared allocations exceed its own charge, i.e.
 * the invoice breaches the allocation cap (BILLING-CALC-AUDIT-1 D15/Ruling 3
 * — 8 of 32 allocations on the dev DB do). Clamping silently would discard
 * the one signal that says so at the moment it is observed.
 *
 * Degrade safely, never silently — same rule as the blank signature slot on
 * a bill whose asset failed to load, and the Nepali print review gate.
 */
export function clampOwnBalance(raw: Money, invoiceRef: string, logger: Logger): Money {
  if (raw.compare(Money.zero()) >= 0) return raw;
  logger.warn(
    `[BILL-CHECKOUT-1] Invoice ${invoiceRef} has a negative own balance (${raw.toDb()}): ` +
      `cleared allocations exceed its own net_amount, so this invoice breaches the allocation cap. ` +
      `Treating it as 0.00 instead. This invoice needs per-student reconstruction before any ` +
      `compensating entry — see BILLING-CALC-AUDIT-1 Ruling 3.`,
  );
  return Money.zero();
}

/** The same CLEARED-only sum as CLEARED_ALLOCATIONS_JOIN, as a correlated
 *  subquery for use inside an UPDATE that has no `bi` alias. `$1` is the
 *  invoice id. */
const CLEARED_ALLOCATION_SUM = `SELECT COALESCE(SUM(bpa.amount), 0)
           FROM bill_payment_allocations bpa
           JOIN bill_payments bp ON bp.id = bpa.bill_payment_id AND bp.status = 'CLEARED'
           WHERE bpa.bill_invoice_id = $1::uuid`;

/**
 * ALLOCATION-CAP-1: settlement is judged against the invoice's OWN charge,
 * for the same reason the cap is. Under the cap an invoice's allocations can
 * never exceed `net_amount`, so leaving this comparing against
 * `total_receivable` would make SETTLED unreachable for every invoice that
 * carries a previous balance — it would sit at PARTIALLY_PAID forever with
 * nothing left to pay. The cap and this expression have to move together.
 *
 * Two writers (BillPaymentService.recomputeInvoiceStatus and
 * BillRunPostRunnerService's advance auto-apply) had a byte-identical copy
 * each; one constant so they cannot drift. `$1` is the invoice id.
 */
export const INVOICE_STATUS_RECOMPUTE_SQL = `UPDATE bill_invoices SET
         status = CASE
           WHEN net_amount <= (${CLEARED_ALLOCATION_SUM}) THEN 'SETTLED'
           WHEN (${CLEARED_ALLOCATION_SUM}) > 0 THEN 'PARTIALLY_PAID'
           ELSE 'POSTED'
         END,
         updated_at = NOW()
       WHERE id = $1::uuid`;
