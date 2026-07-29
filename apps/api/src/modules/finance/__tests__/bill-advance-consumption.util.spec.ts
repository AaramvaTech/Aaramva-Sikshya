import { Money } from '../../../common/money/money';
import { planAdvanceConsumption, UnconsumedPaymentCandidate } from '../bill-advance-consumption.util';

function candidate(id: string, remaining: string): UnconsumedPaymentCandidate {
  return { billPaymentId: id, remaining: Money.fromDb(remaining) };
}

describe('planAdvanceConsumption', () => {
  it('consumes one old payment fully when it exactly covers the invoice', () => {
    const plan = planAdvanceConsumption(Money.fromDb('2000.00'), [candidate('pay-1', '2000.00')]);
    expect(plan.consumptions).toEqual([{ billPaymentId: 'pay-1', amount: Money.fromDb('2000.00') }]);
    expect(plan.unconsumed.isZero()).toBe(true);
  });

  it('partially consumes one old payment when it exceeds the invoice', () => {
    const plan = planAdvanceConsumption(Money.fromDb('1500.00'), [candidate('pay-1', '5000.00')]);
    expect(plan.consumptions).toEqual([{ billPaymentId: 'pay-1', amount: Money.fromDb('1500.00') }]);
    expect(plan.unconsumed.isZero()).toBe(true);
  });

  it('walks multiple old payments oldest-first until the invoice is covered', () => {
    const candidates = [candidate('pay-1', '1000.00'), candidate('pay-2', '3000.00')];
    const plan = planAdvanceConsumption(Money.fromDb('2500.00'), candidates);
    expect(plan.consumptions).toEqual([
      { billPaymentId: 'pay-1', amount: Money.fromDb('1000.00') },
      { billPaymentId: 'pay-2', amount: Money.fromDb('1500.00') },
    ]);
    expect(plan.unconsumed.isZero()).toBe(true);
  });

  it('leaves the invoice partially uncovered when total advance is insufficient', () => {
    const plan = planAdvanceConsumption(Money.fromDb('10000.00'), [candidate('pay-1', '2000.00')]);
    expect(plan.consumptions).toEqual([{ billPaymentId: 'pay-1', amount: Money.fromDb('2000.00') }]);
    expect(plan.unconsumed.compare(Money.fromDb('8000.00'))).toBe(0);
  });

  it('no candidates means nothing is consumed, invoice fully unconsumed', () => {
    const plan = planAdvanceConsumption(Money.fromDb('2000.00'), []);
    expect(plan.consumptions).toEqual([]);
    expect(plan.unconsumed.compare(Money.fromDb('2000.00'))).toBe(0);
  });
});
