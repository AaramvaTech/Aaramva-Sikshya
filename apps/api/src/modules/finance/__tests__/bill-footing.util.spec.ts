import { Money } from '../../../common/money/money';
import { ResolvedInvoiceItem } from '../bill-line-resolver.service';
import {
  reconcileItemsToFootTarget,
  describeFrozenLineDrift,
  FOOTING_TOLERANCE,
} from '../bill-footing.util';

function item(overrides: Partial<ResolvedInvoiceItem> = {}): ResolvedInvoiceItem {
  return {
    feeHeadId: 'fh-1', transportRouteId: null, itemName: 'Tuition', recurrence: 'MONTHLY',
    isTaxable: false, grossAmount: 1000, concessionAmount: 0, netAmount: 1000, prorationNote: null,
    ...overrides,
  };
}

describe('reconcileItemsToFootTarget — D13-CLUSTER-FOOTING', () => {
  it('a target equal to the current subtotal is a no-op', () => {
    const items = [item({ grossAmount: 1000, netAmount: 1000 })];
    const { items: out, residual } = reconcileItemsToFootTarget(items, Money.fromDb('1000.00'));
    expect(out[0].netAmount).toBe(1000);
    expect(out[0].concessionAmount).toBe(0);
    expect(residual.isZero()).toBe(true);
  });

  it('the whole-bill-concession case: apportions by gross share, exact to the paisa, no remainder left over', () => {
    const items = [
      item({ grossAmount: 1000, netAmount: 1000 }),
      item({ feeHeadId: null, transportRouteId: 'route-1', grossAmount: 300, netAmount: 300 }),
    ];
    // header's own net after a 200 whole-bill concession: 1300 - 200 = 1100
    const { items: out, residual } = reconcileItemsToFootTarget(items, Money.fromDb('1100.00'));

    expect(out[0].concessionAmount).toBe(153.85);
    expect(out[0].netAmount).toBe(846.15);
    expect(out[1].concessionAmount).toBe(46.15);
    expect(out[1].netAmount).toBe(253.85);

    const sum = out.reduce((acc, i) => acc.add(Money.fromNumber(i.netAmount)), Money.zero());
    expect(sum.compare(Money.fromDb('1100.00'))).toBe(0);
    expect(residual.isZero()).toBe(true);
  });

  it('D8 overshoot reaching a SINGLE item: the ceiling caps concession at gross, and — because the target itself is already header-clamped — still foots exactly', () => {
    // This is the shape resolve() actually produces (target already >= 0):
    // a 200 gap against one 50-gross item, target = 0 (header's own clamp).
    const items = [item({ grossAmount: 50, netAmount: 50 })];
    const { items: out, residual } = reconcileItemsToFootTarget(items, Money.zero());

    expect(out[0].concessionAmount).toBe(50); // capped at gross, not the full 200 implied by the caller's other math
    expect(out[0].netAmount).toBe(0);
    expect(residual.isZero()).toBe(true);
  });

  it('a genuinely unclosable target (negative — below what any item can give) is reported as a nonzero residual, not silently forced', () => {
    // No real caller in this codebase can construct target < 0 (resolve()
    // clamps it first) — this exists to prove the residual math itself is
    // honest, independent of that external guarantee holding.
    //
    // A single 50-gross, 50-net item asked to foot to target=-10: closing
    // the full gap would need this item's net at -10, but the ceiling stops
    // concession at gross (net floors at 0) — 50 of the needed 60 closes,
    // 10 is left over and reported, not silently forced or dropped.
    const items = [item({ grossAmount: 50, netAmount: 50, concessionAmount: 0 })];
    const { items: out, residual } = reconcileItemsToFootTarget(items, Money.fromDb('-10.00'));

    expect(out[0].netAmount).toBe(0);
    expect(out[0].concessionAmount).toBe(50); // capped at this item's own gross
    expect(residual.compare(Money.fromDb('10.00'))).toBe(0);
    expect(residual.compare(FOOTING_TOLERANCE).valueOf()).toBeGreaterThan(0);
  });

  it('negative gap (items under-report by a paisa, pure rounding — D13a) is absorbed with no floor on concession', () => {
    // subtotal (1000.00 + 500.01) = 1500.01, target = 1500.02 — a single
    // paisa of pure rounding drift with ZERO existing concession anywhere.
    // The old (wrong) lower-bound clamp would have left this unclosed on an
    // entirely ordinary, concession-free invoice.
    const items = [
      item({ grossAmount: 1000, netAmount: 1000, concessionAmount: 0 }),
      item({ feeHeadId: 'fh-2', grossAmount: 500, netAmount: 500.01, concessionAmount: 0 }),
    ];
    const { items: out, residual } = reconcileItemsToFootTarget(items, Money.fromDb('1500.02'));

    const sum = out.reduce((acc, i) => acc.add(Money.fromNumber(i.netAmount)), Money.zero());
    expect(sum.compare(Money.fromDb('1500.02'))).toBe(0);
    expect(residual.isZero()).toBe(true);
    // At least one item now carries a small NEGATIVE concession — a pure
    // accounting nudge, not a real discount, and never displayed as its own
    // figure (matches apportionedConcession's own unbounded convention).
    expect(out.some((i) => i.concessionAmount < 0)).toBe(true);
  });

  it('an empty item list with a nonzero target reports the whole target as residual', () => {
    const { items: out, residual } = reconcileItemsToFootTarget([], Money.fromDb('50.00'));
    expect(out).toEqual([]);
    expect(residual.compare(Money.fromDb('-50.00'))).toBe(0);
  });
});

describe('describeFrozenLineDrift — D14', () => {
  const frozen = { gross: '3000.00', tax: '0.00', net: '3000.00' };

  it('reports nothing when the fresh resolve agrees with the frozen draft line', () => {
    expect(describeFrozenLineDrift({ gross: 3000, taxAmount: 0, net: 3000 }, frozen)).toEqual([]);
  });

  it('a sub-tolerance difference (representation noise) is not reported', () => {
    expect(describeFrozenLineDrift({ gross: 3000.001, taxAmount: 0, net: 3000.001 }, frozen)).toEqual([]);
  });

  it('names a drifted gross without flagging the unrelated net/tax that still agree', () => {
    const drifted = describeFrozenLineDrift({ gross: 3500, taxAmount: 0, net: 3000 }, frozen);
    expect(drifted).toHaveLength(1);
    expect(drifted[0]).toContain('gross');
    expect(drifted[0]).toContain('3000.00');
    expect(drifted[0]).toContain('3500.00');
  });

  it('a catalog change that only moves net (gross and tax unchanged) is still caught — concession drift has no blind spot', () => {
    // e.g. a NEW concession appeared between draft and post: gross and tax
    // unchanged, net alone drops. Confirms net is doing the concession-drift
    // job the docstring claims, not skipping it because concession itself
    // isn't compared directly.
    const drifted = describeFrozenLineDrift({ gross: 3000, taxAmount: 0, net: 2500 }, frozen);
    expect(drifted.some((d) => d.startsWith('net'))).toBe(true);
  });

  it('reports every drifted figure, not just the first', () => {
    const drifted = describeFrozenLineDrift({ gross: 4000, taxAmount: 100, net: 3500 }, frozen);
    expect(drifted).toHaveLength(3);
  });

  it('a custom tolerance is honoured', () => {
    const tight = Money.fromNumber(0.001);
    expect(
      describeFrozenLineDrift({ gross: 3000.005, taxAmount: 0, net: 3000.005 }, frozen, tight),
    ).not.toEqual([]);
  });
});
