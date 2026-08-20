import { splitUnallocated } from '../bill-receipt-document.service';
import { Money } from '../../../common/money/money';

/**
 * Unallocated money still credits the ledger, so it reduces the balance whether
 * or not it is tied to an invoice. Calling all of it "Advance credit" claims it
 * is being HELD, which is false when the student still owed.
 */
describe('splitUnallocated', () => {
  const m = (n: number) => Money.fromNumber(n);

  it('nothing advanced when the payment only cleared debt', () => {
    // owed 1500, pays 1500 unallocated -> balance 0
    expect(splitUnallocated(m(1500), { amount: 0, sign: 'ZERO' }))
      .toEqual({ appliedToBalance: 1500, advanceCredit: 0 });
  });

  it('all advanced when the student owed nothing', () => {
    // owed 0, pays 1500 unallocated -> balance -1500
    expect(splitUnallocated(m(1500), { amount: -1500, sign: 'ADVANCE' }))
      .toEqual({ appliedToBalance: 0, advanceCredit: 1500 });
  });

  it('splits when the payment both cleared debt AND left credit', () => {
    // owed 500, pays 1500 unallocated -> balance -1000
    expect(splitUnallocated(m(1500), { amount: -1000, sign: 'ADVANCE' }))
      .toEqual({ appliedToBalance: 500, advanceCredit: 1000 });
  });

  it('nothing advanced when the student still owes after paying', () => {
    // owed 5000, pays 1500 unallocated -> balance 3500
    expect(splitUnallocated(m(1500), { amount: 3500, sign: 'OWES' }))
      .toEqual({ appliedToBalance: 1500, advanceCredit: 0 });
  });

  it('does not split what it cannot determine (unposted payment)', () => {
    // No ledger entry: the division was never computed, so it is not asserted.
    expect(splitUnallocated(m(1500), null))
      .toEqual({ appliedToBalance: 0, advanceCredit: 1500 });
  });

  it('is a no-op when the payment was fully allocated', () => {
    expect(splitUnallocated(m(0), { amount: 100, sign: 'OWES' }))
      .toEqual({ appliedToBalance: 0, advanceCredit: 0 });
  });

  it('the two parts ALWAYS add back to the unallocated total', () => {
    // The allocation table foots against the amount received, so this cannot
    // drift by a paisa. Checked across the awkward decimals too.
    for (const unallocated of [0.01, 19.99, 1500, 1234.56, 99999.99]) {
      for (const bal of [
        { amount: 0, sign: 'ZERO' as const },
        { amount: -0.01, sign: 'ADVANCE' as const },
        { amount: -600.5, sign: 'ADVANCE' as const },
        { amount: -1e6, sign: 'ADVANCE' as const },
        { amount: 42, sign: 'OWES' as const },
      ]) {
        const r = splitUnallocated(Money.fromNumber(unallocated), bal);
        expect(Money.fromNumber(r.appliedToBalance).add(Money.fromNumber(r.advanceCredit)).toNumber())
          .toBeCloseTo(unallocated, 2);
        expect(r.appliedToBalance).toBeGreaterThanOrEqual(0);
        expect(r.advanceCredit).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
