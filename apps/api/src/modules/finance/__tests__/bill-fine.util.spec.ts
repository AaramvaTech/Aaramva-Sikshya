import { Money } from '../../../common/money/money';
import { pickApplicableRule, computeTotalFine, addDaysAd, FineRule } from '../bill-fine.util';

describe('addDaysAd', () => {
  it('adds days within a month', () => {
    expect(addDaysAd('2026-07-24', 1)).toBe('2026-07-25');
  });

  it('rolls over a month boundary', () => {
    expect(addDaysAd('2026-07-31', 1)).toBe('2026-08-01');
  });

  it('rolls over a year boundary', () => {
    expect(addDaysAd('2026-12-31', 1)).toBe('2027-01-01');
  });
});

function rule(overrides: Partial<FineRule> = {}): FineRule {
  return {
    id: 'rule-1', scope: 'GLOBAL', feeHeadId: null, type: 'PER_DAY',
    value: Money.fromNumber(10), graceDays: 0, capAmount: null,
    effectiveFrom: '2026-01-01',
    ...overrides,
  };
}

describe('computeTotalFine', () => {
  it('PER_DAY: value x daysOverdue', () => {
    const total = computeTotalFine(rule({ type: 'PER_DAY', value: Money.fromNumber(10) }), 10, Money.fromNumber(5000));
    expect(total.toDb()).toBe('100.00');
  });

  it('FLAT: flat value regardless of daysOverdue', () => {
    const total = computeTotalFine(rule({ type: 'FLAT', value: Money.fromNumber(250) }), 30, Money.fromNumber(5000));
    expect(total.toDb()).toBe('250.00');
  });

  it('PERCENT: value% of outstanding', () => {
    const total = computeTotalFine(rule({ type: 'PERCENT', value: Money.fromNumber(5) }), 10, Money.fromNumber(2000));
    expect(total.toDb()).toBe('100.00');
  });

  it('clamps to capAmount when the computed total exceeds it', () => {
    const total = computeTotalFine(
      rule({ type: 'PER_DAY', value: Money.fromNumber(10), capAmount: Money.fromNumber(80) }),
      10, Money.fromNumber(5000),
    );
    expect(total.toDb()).toBe('80.00');
  });

  it('does not clamp when under the cap', () => {
    const total = computeTotalFine(
      rule({ type: 'PER_DAY', value: Money.fromNumber(10), capAmount: Money.fromNumber(200) }),
      10, Money.fromNumber(5000),
    );
    expect(total.toDb()).toBe('100.00');
  });
});

describe('pickApplicableRule', () => {
  it('returns null when nothing matches', () => {
    expect(pickApplicableRule([rule({ scope: 'FEE_HEAD', feeHeadId: 'head-1' })], ['head-2'])).toBeNull();
  });

  it('GLOBAL matches any invoice', () => {
    expect(pickApplicableRule([rule({ scope: 'GLOBAL' })], [])?.id).toBe('rule-1');
  });

  it('FEE_HEAD matches only when the invoice carries that head', () => {
    const r = rule({ id: 'r2', scope: 'FEE_HEAD', feeHeadId: 'head-1' });
    expect(pickApplicableRule([r], ['head-1'])?.id).toBe('r2');
    expect(pickApplicableRule([r], ['head-2'])).toBeNull();
  });

  it('FEE_HEAD wins over GLOBAL when both match', () => {
    const g = rule({ id: 'global', scope: 'GLOBAL' });
    const fh = rule({ id: 'fh', scope: 'FEE_HEAD', feeHeadId: 'head-1' });
    expect(pickApplicableRule([g, fh], ['head-1'])?.id).toBe('fh');
    expect(pickApplicableRule([fh, g], ['head-1'])?.id).toBe('fh');
  });
});
