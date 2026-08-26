import { Money } from '../../common/money/money';
import { ResolvedInvoiceItem } from './bill-line-resolver.service';
import { apportionWholeBillConcession } from './bill-pdf.util';

/**
 * D13-CLUSTER-FOOTING — the two checks the audit named D13/D14/D34 all
 * reduce to: do the stored line items sum to what the header claims, and
 * does a fresh recompute at post time still agree with what was frozen at
 * draft time. Kept together because they are the same shape of question
 * (do two independently-derived figures for the same thing agree) asked at
 * two different points in the pipeline, and because `reconcileItemsToFootTarget`
 * REUSES `apportionWholeBillConcession` rather than reimplementing its
 * exact-remainder-to-largest-gross-line algorithm a second time — that
 * function's own tests (`bill-pdf.util.spec.ts`) already prove its output
 * sums to its input exactly, and this file's job is only to decide WHAT
 * total to apportion and WHERE the result goes, not to re-derive HOW.
 */

/**
 * Tolerance for the D14 draft-vs-post comparison (`describeFrozenLineDrift`).
 * Under unchanged catalog data the two resolve() calls are the same pure
 * computation over the same rows and should agree bit-for-bit — this exists
 * as insurance against Money/JS-number boundary noise between two
 * independently-executed calls, not as a concession to a known, accepted
 * drift source. See BILLING-CALC-AUDIT-1-phase0.md D14.
 */
export const FOOTING_TOLERANCE = Money.fromNumber(0.005);

function absDiff(a: Money, b: Money): Money {
  const diff = a.sub(b);
  return diff.compare(Money.zero()) < 0 ? diff.negate() : diff;
}

/**
 * D13 forward fix. Every item's `netAmount` is already individually
 * rounded (BillLineResolverService's per-head loop); `target` is the
 * header's own pre-tax net, ALSO already rounded the same way the header
 * itself will be. The two can still disagree — the whole-bill concession is
 * never subtracted from any item (D13b), and summing individually-rounded
 * items never exactly equals a separately-rounded aggregate (D13a).
 *
 * Rather than modelling each cause separately, this targets the INVARIANT
 * itself: whatever the gap between `SUM(items.net)` and `target` is, and
 * whatever produced it, apportion that gap across items by gross share
 * (the same rule the print layer's `apportionWholeBillConcession` already
 * uses, reused verbatim here) and fold each item's share into its OWN
 * `concessionAmount`/`netAmount` — matching how the print layer already
 * labels this exact kind of adjustment ("apportioned concession") so a
 * footing NEW invoice's stored items already look like what BILL-8's
 * render-time plug used to have to fabricate.
 *
 * Each item's concession is clamped ABOVE at `grossAmount` — never a
 * negative net for that line — but deliberately NOT floored at zero: a
 * negative adjustment here is always small (bounded by rounding, D13a;
 * an unattributed whole-bill concession only ever pushes the OTHER way)
 * and may need to reduce a concession that is already zero, which the print
 * layer's own identical mechanism (`apportionedConcession` in
 * bill-document.service.ts) has never bounded either.
 *
 * Given `target` is always `netPreTax` — already clamped non-negative by
 * BillLineResolverService before this is called — and every item's own net
 * already had the same clamp applied at the head level (FeePreviewService),
 * `residual` is zero for every input this module's own callers can produce:
 * the positive direction (money to remove) can always be fully absorbed,
 * because the sum of what every item CAN absorb (drive its own net to zero)
 * is exactly `subtotal`, and `target >= 0` guarantees `gap <= subtotal`; the
 * negative direction (money to add back) is now unclamped and so always
 * closes exactly, by `apportionWholeBillConcession`'s own proven
 * sums-to-input guarantee. `residual` still exists as the honest answer
 * this function gives, not a promise it can never be nonzero — see its own
 * spec for a constructed input where it isn't (a caller passing a `target`
 * this module's own callers never would).
 */
export function reconcileItemsToFootTarget(
  items: readonly ResolvedInvoiceItem[],
  target: Money,
): { items: ResolvedInvoiceItem[]; residual: Money } {
  const subtotal = items.reduce((acc, i) => acc.add(Money.fromNumber(i.netAmount)), Money.zero());
  const gap = subtotal.sub(target); // positive: items currently over-report net

  const shares = apportionWholeBillConcession(
    items.map((i) => ({ grossAmount: Money.fromNumber(i.grossAmount) })),
    gap,
  );

  let closed = Money.zero();
  const adjusted = items.map((item, idx) => {
    const gross = Money.fromNumber(item.grossAmount);
    const currentConcession = Money.fromNumber(item.concessionAmount);
    const currentNet = Money.fromNumber(item.netAmount);

    // Upper bound only: a concession can never exceed this item's own gross
    // (that would mean a negative net for the line — the one thing that
    // must never happen). Deliberately NO lower bound (concession is not
    // floored at zero here): when `gap` is negative — items currently
    // UNDER-report, which can only happen from pure per-item rounding
    // placement (D13a), never from an unattributed whole-bill concession
    // (that always makes items OVER-report) — the adjustment needed is a
    // few paisa at most and this item may not have any of its own
    // concession to "give back." Flooring at zero here would leave that
    // paisa unclosed on an entirely ordinary invoice with NO concessions at
    // all, which is a worse defect than the one this function exists to
    // fix. This matches the print layer's own tolerance: `bill-document
    // .service.ts`'s `apportionedConcession` is added on top of the stored
    // `concessionAmount` for display with no bound in either direction —
    // this function is not introducing a new constraint the rest of the
    // module doesn't already accept.
    let newConcession = currentConcession.add(shares[idx]);
    if (newConcession.compare(gross) > 0) newConcession = gross;

    const applied = newConcession.sub(currentConcession);
    closed = closed.add(applied);

    return {
      ...item,
      concessionAmount: newConcession.toNumber(),
      netAmount: currentNet.sub(applied).toNumber(),
    };
  });

  return { items: adjusted, residual: gap.sub(closed) };
}

/** Frozen `bill_run_lines` figures, as read from Postgres (NUMERIC → string). */
export interface FrozenLineFigures {
  gross: string;
  tax: string;
  net: string;
}

/** The subset of `ResolvedBillLine` the D14 comparison needs. */
export interface FreshLineFigures {
  gross: number;
  taxAmount: number;
  net: number;
}

/**
 * D14 fix. The old guard (`resolved.outcome !== 'DRAFT'`) checks the enum
 * and stops — this checks the figures that were actually in scope beside it.
 * Returns a human-readable line per drifted figure (empty when everything
 * agrees), naming the frozen (draft) value against the fresh (post) one, so
 * the resulting FAILED line's `skip_reason` tells an accountant what
 * changed rather than just that something did.
 *
 * Deliberately does not compare `concession`: `net = gross - concession +
 * tax` holds by construction inside resolve() at both call sites, so any
 * concession drift that left gross and tax unchanged would already show up
 * as a net drift — checking concession separately could not catch anything
 * these three checks miss.
 */
export function describeFrozenLineDrift(
  resolved: FreshLineFigures,
  frozen: FrozenLineFigures,
  tolerance: Money = FOOTING_TOLERANCE,
): string[] {
  const checks: [string, Money, Money][] = [
    ['gross', Money.fromNumber(resolved.gross), Money.fromDb(frozen.gross)],
    ['tax', Money.fromNumber(resolved.taxAmount), Money.fromDb(frozen.tax)],
    ['net', Money.fromNumber(resolved.net), Money.fromDb(frozen.net)],
  ];

  const drifted: string[] = [];
  for (const [label, fresh, draft] of checks) {
    if (absDiff(fresh, draft).compare(tolerance) > 0) {
      drifted.push(`${label} drifted from ${draft.toDb()} (draft) to ${fresh.toDb()} (post)`);
    }
  }
  return drifted;
}
