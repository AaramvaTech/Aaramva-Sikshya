import { Money } from '../../common/money/money';

/** Adds n days to an AD date string ("YYYY-MM-DD"), returning the same
 *  format. UTC-frame arithmetic on the date's own local components (not
 *  toISOString() on a locally-constructed Date) — the FIX-2 discipline for
 *  DB-sourced DATE values, which this is. */
export function addDaysAd(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

export interface FineRule {
  id: string;
  scope: 'GLOBAL' | 'FEE_HEAD';
  feeHeadId: string | null;
  type: 'FLAT' | 'PER_DAY' | 'PERCENT';
  value: Money;
  graceDays: number;
  capAmount: Money | null;
  effectiveFrom: string;
}

/**
 * BILL-7 build-time ruling (not spelled out in BILL-7-SPEC.md §3): exactly
 * one rule applies per invoice per run. FEE_HEAD beats GLOBAL when both
 * match (more specific wins); ties break on effectiveFrom DESC. Prevents two
 * rules both trying to insert a bill_fine_accruals row for the same
 * (invoice, accrued_through) in one run — the spec's worked examples are all
 * single-rule and never ask for stacking.
 */
export function pickApplicableRule(rules: FineRule[], feeHeadIds: string[]): FineRule | null {
  const matches = rules.filter(
    (r) => r.scope === 'GLOBAL' || (r.feeHeadId != null && feeHeadIds.includes(r.feeHeadId)),
  );
  if (matches.length === 0) return null;
  return [...matches].sort((a, b) => {
    if (a.scope !== b.scope) return a.scope === 'FEE_HEAD' ? -1 : 1;
    return b.effectiveFrom.localeCompare(a.effectiveFrom);
  })[0];
}

/** BILL-7-SPEC.md §3 step 2. FLAT/PER_DAY/PERCENT, each clamped to capAmount
 * if set (B7-3) — cap applies uniformly across all three types per the
 * spec's own wording ("each clamped to cap_amount if set"). */
export function computeTotalFine(rule: FineRule, daysOverdue: number, outstanding: Money): Money {
  let total: Money;
  switch (rule.type) {
    case 'FLAT':
      total = rule.value;
      break;
    case 'PER_DAY':
      total = rule.value.mul(daysOverdue);
      break;
    case 'PERCENT':
      total = outstanding.percentOf(rule.value.toNumber());
      break;
  }
  if (rule.capAmount && total.compare(rule.capAmount) > 0) return rule.capAmount;
  return total;
}
