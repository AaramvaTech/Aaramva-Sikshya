import { Money } from '../../common/money/money';

export interface UnpaidInvoiceCandidate {
  billInvoiceId: string;
  outstanding: Money;
}

export interface AllocationPlanItem {
  billInvoiceId: string;
  amount: Money;
}

export interface AllocationPlan {
  allocations: AllocationPlanItem[];
  remainder: Money;
}

/**
 * B5-3 AUTO_FIFO: walk the given candidates (caller must pass them already
 * ordered oldest-first — this function does no sorting) and allocate the
 * payment amount against each until exhausted or candidates run out. Pure —
 * cannot fail; a payment larger than total outstanding simply leaves a
 * nonzero remainder (advance credit, B5-4).
 */
export function planAutoFifoAllocation(
  amount: Money,
  candidatesOldestFirst: UnpaidInvoiceCandidate[],
): AllocationPlan {
  let remaining = amount;
  const allocations: AllocationPlanItem[] = [];

  for (const candidate of candidatesOldestFirst) {
    if (remaining.isZero()) break;
    const applied = remaining.compare(candidate.outstanding) <= 0 ? remaining : candidate.outstanding;
    allocations.push({ billInvoiceId: candidate.billInvoiceId, amount: applied });
    remaining = remaining.sub(applied);
  }

  return { allocations, remainder: remaining };
}
