import { Money } from '../../common/money/money';

export interface UnconsumedPaymentCandidate {
  billPaymentId: string;
  remaining: Money;
}

export interface AdvanceConsumptionItem {
  billPaymentId: string;
  amount: Money;
}

export interface AdvanceConsumptionPlan {
  consumptions: AdvanceConsumptionItem[];
  unconsumed: Money;
}

/**
 * B5-4 advance auto-apply: walk the student's unconsumed CLEARED payments
 * (caller must pass them already ordered oldest-first) and apply as much of
 * each as needed to cover the newly-posted invoice's total_receivable.
 * Deliberately NOT a reuse of planAutoFifoAllocation (bill-payment-
 * allocation.util.ts) despite the identical walk shape — this direction is
 * "many old payments -> one new invoice" rather than "one payment -> many
 * invoices", and renaming that already-reviewed, already-proven type's
 * `billInvoiceId` field to serve double duty here would read as a payment id
 * at this call site. Pure — cannot fail; insufficient advance simply leaves
 * `unconsumed` on the invoice side (the invoice stays PARTIALLY_PAID/POSTED).
 */
export function planAdvanceConsumption(
  invoiceOutstanding: Money,
  candidatesOldestFirst: UnconsumedPaymentCandidate[],
): AdvanceConsumptionPlan {
  let remaining = invoiceOutstanding;
  const consumptions: AdvanceConsumptionItem[] = [];

  for (const candidate of candidatesOldestFirst) {
    if (remaining.isZero()) break;
    const applied = remaining.compare(candidate.remaining) <= 0 ? remaining : candidate.remaining;
    consumptions.push({ billPaymentId: candidate.billPaymentId, amount: applied });
    remaining = remaining.sub(applied);
  }

  return { consumptions, unconsumed: remaining };
}
