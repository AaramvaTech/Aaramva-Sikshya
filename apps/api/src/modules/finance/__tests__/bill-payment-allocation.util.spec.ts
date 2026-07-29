import { Money } from '../../../common/money/money';
import { planAutoFifoAllocation, UnpaidInvoiceCandidate } from '../bill-payment-allocation.util';

function candidate(id: string, outstanding: string): UnpaidInvoiceCandidate {
  return { billInvoiceId: id, outstanding: Money.fromDb(outstanding) };
}

describe('planAutoFifoAllocation', () => {
  it('fully settles a single invoice and leaves zero remainder when the amount matches exactly', () => {
    const plan = planAutoFifoAllocation(Money.fromDb('3000.00'), [candidate('inv-1', '3000.00')]);
    expect(plan.allocations).toEqual([{ billInvoiceId: 'inv-1', amount: Money.fromDb('3000.00') }]);
    expect(plan.remainder.isZero()).toBe(true);
  });

  it('partially settles a single invoice, leftover stays on the invoice (not the remainder)', () => {
    const plan = planAutoFifoAllocation(Money.fromDb('5000.00'), [candidate('inv-1', '8500.00')]);
    expect(plan.allocations).toEqual([{ billInvoiceId: 'inv-1', amount: Money.fromDb('5000.00') }]);
    expect(plan.remainder.isZero()).toBe(true);
  });

  it('walks three invoices oldest-first, partial lands on the boundary invoice, correct leftover', () => {
    const candidates = [candidate('inv-1', '2000.00'), candidate('inv-2', '3000.00'), candidate('inv-3', '1500.00')];
    const plan = planAutoFifoAllocation(Money.fromDb('4500.00'), candidates);
    expect(plan.allocations).toEqual([
      { billInvoiceId: 'inv-1', amount: Money.fromDb('2000.00') },
      { billInvoiceId: 'inv-2', amount: Money.fromDb('2500.00') },
    ]);
    expect(plan.remainder.isZero()).toBe(true);
  });

  it('overpayment beyond all outstanding invoices becomes the remainder (advance credit)', () => {
    const candidates = [candidate('inv-1', '2000.00'), candidate('inv-2', '3000.00')];
    const plan = planAutoFifoAllocation(Money.fromDb('6000.00'), candidates);
    expect(plan.allocations).toEqual([
      { billInvoiceId: 'inv-1', amount: Money.fromDb('2000.00') },
      { billInvoiceId: 'inv-2', amount: Money.fromDb('3000.00') },
    ]);
    expect(plan.remainder.compare(Money.fromDb('1000.00'))).toBe(0);
  });

  it('empty candidate list makes the entire amount the remainder', () => {
    const plan = planAutoFifoAllocation(Money.fromDb('2000.00'), []);
    expect(plan.allocations).toEqual([]);
    expect(plan.remainder.compare(Money.fromDb('2000.00'))).toBe(0);
  });
});
