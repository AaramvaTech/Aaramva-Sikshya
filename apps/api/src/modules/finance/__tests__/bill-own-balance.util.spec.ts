import { Logger } from '@nestjs/common';
import { Money } from '../../../common/money/money';
import {
  OWN_BALANCE_SELECT,
  CLEARED_ALLOCATIONS_JOIN,
  clampOwnBalance,
} from '../bill-own-balance.util';

/**
 * BILL-CHECKOUT-1. The defect these pin (BILLING-CALC-AUDIT-1 D32) is that
 * checkout charged `total_receivable` — an invoice's own charge PLUS every
 * earlier unpaid month — while those earlier invoices stayed separately
 * payable, so the same arrears could be collected twice. Confirmed live:
 * demo/Aarav Shrestha, 2026-08-12, charged 4,260 for a 2,260 invoice, then
 * the folded-in 2,000 paid again on its own invoice.
 */
function fakeLogger(): { logger: Logger; warnings: string[] } {
  const warnings: string[] = [];
  const logger = { warn: (m: string) => { warnings.push(m); } } as unknown as Logger;
  return { logger, warnings };
}

describe('OWN_BALANCE_SELECT', () => {
  it('reads net_amount, never total_receivable — the whole point of the ticket', () => {
    expect(OWN_BALANCE_SELECT).toContain('bi.net_amount');
    expect(OWN_BALANCE_SELECT).not.toContain('total_receivable');
    expect(OWN_BALANCE_SELECT).not.toContain('previous_balance');
  });

  it('nets off allocations and aliases to own_balance', () => {
    expect(OWN_BALANCE_SELECT).toContain('COALESCE(SUM(bpa.amount), 0)');
    expect(OWN_BALANCE_SELECT).toContain('AS own_balance');
  });
});

describe('CLEARED_ALLOCATIONS_JOIN', () => {
  it("only a CLEARED payment's allocations reduce the balance (B5-5)", () => {
    // A PENDING cheque or a VOIDED/BOUNCED payment must not make an invoice
    // look spoken for — if this filter were dropped, a bounced cheque would
    // silently reduce what a parent is asked to pay.
    expect(CLEARED_ALLOCATIONS_JOIN).toContain("bp.status = 'CLEARED'");
    expect(CLEARED_ALLOCATIONS_JOIN).toContain('LEFT JOIN bill_payment_allocations');
  });
});

describe('clampOwnBalance', () => {
  it('passes a positive balance through untouched and logs nothing', () => {
    const { logger, warnings } = fakeLogger();
    expect(clampOwnBalance(Money.fromNumber(2260), 'BINV-2083-000004', logger).toDb()).toBe('2260.00');
    expect(warnings).toHaveLength(0);
  });

  it('passes zero through untouched and logs nothing — a settled invoice is not a breach', () => {
    const { logger, warnings } = fakeLogger();
    expect(clampOwnBalance(Money.zero(), 'BINV-2083-000002', logger).isZero()).toBe(true);
    expect(warnings).toHaveLength(0);
  });

  it('clamps a negative balance to zero AND warns, naming the invoice', () => {
    // Ruling 4: degrade safely, never silently. A negative own balance means
    // this invoice breaches the allocation cap (Ruling 3) — clamping without
    // logging would discard the one signal that says so.
    const { logger, warnings } = fakeLogger();
    const result = clampOwnBalance(Money.fromNumber(-2000), 'BINV-2083-000004', logger);
    expect(result.isZero()).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('BINV-2083-000004');
    expect(warnings[0]).toContain('-2000.00');
    expect(warnings[0]).toContain('allocation cap');
  });

  it('the clamp is not silent — this is the assertion that fails if the WARN is ever removed', () => {
    const { logger, warnings } = fakeLogger();
    clampOwnBalance(Money.fromNumber(-0.01), 'BINV-X', logger);
    expect(warnings).toHaveLength(1);
  });
});

describe('the confirmed overcharge, at the figure the gateway would sign', () => {
  // demo / Aarav Shrestha. Invoice BINV-2083-000004: own charge 2,260,
  // previous_balance 2,000, total_receivable 4,260, nothing allocated yet.
  const OWN_CHARGE = 2260;
  const CARRIED = 2000;
  const TOTAL_RECEIVABLE = OWN_CHARGE + CARRIED;

  it('charges the own charge, not the statement figure', () => {
    const { logger } = fakeLogger();
    const charged = clampOwnBalance(Money.fromNumber(OWN_CHARGE - 0), 'BINV-2083-000004', logger).toNumber();
    expect(charged).toBe(2260);
    expect(charged).not.toBe(TOTAL_RECEIVABLE);
  });

  it('the second invoice is still payable for its own 2,000 — and the two now total what was charged', () => {
    const { logger } = fakeLogger();
    const first = clampOwnBalance(Money.fromNumber(2000), 'BINV-2083-000002', logger).toNumber();
    const second = clampOwnBalance(Money.fromNumber(OWN_CHARGE), 'BINV-2083-000004', logger).toNumber();
    expect(first + second).toBe(4260); // was 6,260 pre-fix
  });
});
