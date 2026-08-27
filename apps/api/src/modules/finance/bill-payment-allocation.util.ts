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

// ─── BILL-7 checkout fix — fine accruals as a second payable target ─────────

export interface UnpaidFineCandidate {
  billFineAccrualId: string;
  outstanding: Money;
}

export interface FineAllocationPlanItem {
  billFineAccrualId: string;
  amount: Money;
}

export interface FineAllocationPlan {
  allocations: FineAllocationPlanItem[];
  remainder: Money;
}

/**
 * Same walk-and-allocate algorithm as planAutoFifoAllocation, over fine
 * accrual candidates instead of invoices. Deliberately a PARALLEL function,
 * not a generic reuse of planAutoFifoAllocation — same reasoning
 * bill-advance-consumption.util.ts already gives for its own near-identical
 * walk: renaming that already-reviewed, already-proven type's
 * `billInvoiceId` field to serve double duty here would read as an accrual
 * id at every existing invoice call site. Called with the payment amount
 * still remaining AFTER invoice candidates are exhausted (BillPaymentService
 * — invoices first, then fines; see its own docblock for why).
 */
export function planAutoFifoFineAllocation(
  amount: Money,
  candidatesOldestFirst: UnpaidFineCandidate[],
): FineAllocationPlan {
  let remaining = amount;
  const allocations: FineAllocationPlanItem[] = [];

  for (const candidate of candidatesOldestFirst) {
    if (remaining.isZero()) break;
    const applied = remaining.compare(candidate.outstanding) <= 0 ? remaining : candidate.outstanding;
    allocations.push({ billFineAccrualId: candidate.billFineAccrualId, amount: applied });
    remaining = remaining.sub(applied);
  }

  return { allocations, remainder: remaining };
}
