import { formatNPR } from '@/components/finance/amount-display';
import type { BillPaymentAllocationMode, BillPaymentMethod, ManualAllocationTarget } from '@/types/api.types';

/** UI-4-CHECKPOINT-A-SPEC.md §3.2 (ruled) — the counter only offers methods a
 * cashier directly observes. ESEWA/KHALTI are payer-initiated online and only
 * legitimate carrying a real gateway transaction reference; hand-typing one
 * here would be an unverified claim, not a recorded gateway payment.
 *
 * BANK_TRANSFER excluded too, found live during Checkpoint A's own proof
 * (not in the original spec, logged as BILL-5-METHOD-GAP): BillPaymentService
 * .recordPayment only implements CASH/CHEQUE — BANK_TRANSFER is in the DTO's
 * enum (part of BILL-5's eventual full design) but the service 400s it today
 * ("Checkpoint B records CASH and CHEQUE payments only"). Offering it here
 * would let a cashier submit a payment the backend rejects. */
export const COUNTER_PAYMENT_METHODS: BillPaymentMethod[] = ['CASH', 'CHEQUE'];

export function sumManualTargets(targets: ManualAllocationTarget[]): number {
  return targets.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
}

/** At least one target, and the sum must not exceed the payment amount
 * (mirrors CreateBillPaymentDto's own service-side rule) — leftover under
 * the amount is fine, it becomes advance credit. */
export function isManualAllocationValid(targets: ManualAllocationTarget[], amount: string): boolean {
  if (targets.length === 0) return false;
  return sumManualTargets(targets) <= (Number(amount) || 0);
}

export interface BillPaymentDraftFields {
  studentId: string;
  academicYearId: string;
  amount: string;
  method: BillPaymentMethod;
  allocationMode: BillPaymentAllocationMode;
  targets: ManualAllocationTarget[];
  chequeBank: string;
  chequeDate: string;
  reference: string;
}

/** Record-payment page's submit gate. Mirrors BillPaymentService.recordPayment's
 * own CHEQUE rule exactly: bank, date, AND reference (the cheque number) are
 * all required together, not just bank/date. */
export function canSubmitBillPayment(fields: BillPaymentDraftFields): boolean {
  if (!fields.studentId || !fields.academicYearId) return false;
  if (!(Number(fields.amount) > 0)) return false;
  if (fields.method === 'CHEQUE' && (!fields.chequeBank || !fields.chequeDate || !fields.reference)) return false;
  if (fields.allocationMode === 'MANUAL') return isManualAllocationValid(fields.targets, fields.amount);
  return true;
}

export interface PaymentConfirmationParams {
  studentName: string;
  amount: string;
  method: BillPaymentMethod;
  allocationMode: BillPaymentAllocationMode;
  /** Resolved invoice numbers for the currently-checked MANUAL targets —
   * resolution (billInvoiceId -> invoiceNumber) happens caller-side, where
   * the outstanding-invoices list is already loaded. */
  manualAllocations: { invoiceNumber: string; amount: string }[];
}

/** The confirmation shown before POSTing a payment — this screen moves real
 * money, same standard UI-3's bill-run Post confirmation set: name the
 * amount, method, student, and what it settles, before committing. */
export function buildPaymentConfirmationText(params: PaymentConfirmationParams): string {
  const amountText = formatNPR(Number(params.amount) || 0);
  const methodLabel = params.method.replace(/_/g, ' ');

  let settlement: string;
  if (params.allocationMode === 'ADVANCE_ONLY') {
    settlement = 'held entirely as advance credit — no invoice will be settled';
  } else if (params.allocationMode === 'MANUAL') {
    settlement = params.manualAllocations.length === 0
      ? 'no invoices selected'
      : `applied to ${params.manualAllocations.map((a) => `${a.invoiceNumber} (${formatNPR(Number(a.amount) || 0)})`).join(', ')}`;
  } else {
    settlement = 'settles the oldest outstanding invoices first (auto)';
  }

  return `Record a ${methodLabel} payment of ${amountText} for ${params.studentName}? This ${settlement}. `
    + `Payments can't be edited once recorded — only voided (reversed) — so double-check the amount and student before continuing.`;
}
