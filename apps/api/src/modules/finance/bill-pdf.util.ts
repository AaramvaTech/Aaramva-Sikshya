import { Money } from '../../common/money/money';

/**
 * BILL-8 B8-7 — the footing fix, and the load-bearing arithmetic of this
 * phase. `bill_invoice_items` never carries the whole-bill (fee_head_id
 * NULL) concession — only per-head concessions land on items, so summing
 * printed line nets historically fell short of the header net whenever a
 * whole-bill concession existed (TRANSPORT-ITEM's deferred gap). This is a
 * render-time-only computation: it does not mutate any stored row.
 *
 * Apportions `wholeBillConcession` across `lines` proportional to each
 * line's gross, rounded to 2dp per line, with the rounding remainder placed
 * on the largest-gross line so the parts sum to the whole exactly. Callers
 * pass every printed line — including the transport item (§2: transport is
 * included in the apportionment base, not excluded).
 */
export function apportionWholeBillConcession(
  lines: { grossAmount: Money }[],
  wholeBillConcession: Money,
): Money[] {
  if (lines.length === 0) return [];
  if (wholeBillConcession.isZero()) return lines.map(() => Money.zero());

  const totalGross = lines.reduce((acc, l) => acc.add(l.grossAmount), Money.zero());
  if (totalGross.isZero()) return lines.map(() => Money.zero());

  const apportioned = lines.map((l) =>
    Money.fromDb(
      wholeBillConcession.mul(l.grossAmount.toNumber()).div(totalGross.toNumber()).toDb(),
    ),
  );

  const roundedSum = apportioned.reduce((acc, m) => acc.add(m), Money.zero());
  const remainder = wholeBillConcession.sub(roundedSum);
  if (!remainder.isZero()) {
    let largestIdx = 0;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].grossAmount.compare(lines[largestIdx].grossAmount) > 0) largestIdx = i;
    }
    apportioned[largestIdx] = apportioned[largestIdx].add(remainder);
  }

  return apportioned;
}
