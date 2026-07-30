import { Money } from '../../../common/money/money';
import { apportionWholeBillConcession } from '../bill-pdf.util';

function line(gross: string): { grossAmount: Money } {
  return { grossAmount: Money.fromDb(gross) };
}

describe('apportionWholeBillConcession — B8-7 footing fix', () => {
  it('splits the whole-bill concession proportionally to each line\'s gross, exact to the paisa (no remainder needed)', () => {
    // 1000 gross tuition + 500 gross transport, 150 whole-bill concession, split 2:1 divides evenly.
    const lines = [line('1000.00'), line('500.00')];
    const apportioned = apportionWholeBillConcession(lines, Money.fromDb('150.00'));
    expect(apportioned.map((m) => m.toDb())).toEqual(['100.00', '50.00']);
    const sum = apportioned.reduce((acc, m) => acc.add(m), Money.zero());
    expect(sum.compare(Money.fromDb('150.00'))).toBe(0);
  });

  it('places the rounding remainder on the largest-gross line — the exact-to-paisa invariant', () => {
    // Three equal 100.00-gross lines splitting a 10.00 concession: 10/3 = 3.3333...,
    // each rounds to 3.33, and 3.33*3 = 9.99 — a real 0.01 remainder that must land somewhere.
    const lines = [line('100.00'), line('100.00'), line('100.00')];
    const apportioned = apportionWholeBillConcession(lines, Money.fromDb('10.00'));
    const sum = apportioned.reduce((acc, m) => acc.add(m), Money.zero());
    expect(sum.compare(Money.fromDb('10.00'))).toBe(0);
    // Tied for largest-gross — the first line (by array order) absorbs the remainder.
    expect(apportioned.map((m) => m.toDb())).toEqual(['3.34', '3.33', '3.33']);
  });

  it('a transport-only-weighted split — transport line included in the apportionment base, not excluded', () => {
    const lines = [line('2000.00'), line('1000.00')]; // e.g. tuition + transport
    const apportioned = apportionWholeBillConcession(lines, Money.fromDb('300.00'));
    expect(apportioned.map((m) => m.toDb())).toEqual(['200.00', '100.00']);
  });

  it('zero whole-bill concession apportions zero to every line', () => {
    const lines = [line('1000.00'), line('500.00')];
    const apportioned = apportionWholeBillConcession(lines, Money.zero());
    expect(apportioned.every((m) => m.isZero())).toBe(true);
  });

  it('empty line list apportions nothing (defensive — no real invoice has zero items)', () => {
    expect(apportionWholeBillConcession([], Money.fromDb('100.00'))).toEqual([]);
  });

  it('the load-bearing invariant: for ANY set of lines + whole-bill concession, the sum of apportioned amounts equals the concession exactly to the paisa', () => {
    const cases: [string[], string][] = [
      [['333.33', '333.33', '333.34'], '10.00'],
      [['1.00', '1.00', '1.00', '1.00', '1.00', '1.00', '1.00'], '7.00'],
      [['9999.99', '0.01'], '50.00'],
    ];
    for (const [gross, concession] of cases) {
      const apportioned = apportionWholeBillConcession(gross.map(line), Money.fromDb(concession));
      const sum = apportioned.reduce((acc, m) => acc.add(m), Money.zero());
      expect(sum.compare(Money.fromDb(concession))).toBe(0);
    }
  });
});
