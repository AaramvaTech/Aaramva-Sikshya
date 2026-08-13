import type { BillCorrectionType, RefundMethod } from '@/types/api.types';

/** UI-5-SPEC.md §3.2 — cap previews are explicitly non-authoritative UX
 * guardrails; the backend re-validates the real cap at both request and
 * approve time (bill-correction.service.ts's own creditableAmount /
 * availableCredit / owedBalance). These mirror that math using data already
 * on the New Correction page, so a request that's obviously oversized never
 * needs a round trip to find out. */

interface CorrectionLike {
  type: BillCorrectionType;
  targetInvoiceId: string | null;
  targetInvoiceItemId: string | null;
  amount: number;
}

/** Matches creditableAmount's invoice-level "credited" sum exactly: ALL
 * APPROVED CREDIT_NOTE/WRITE_OFF rows against this invoice, item-scoped or
 * not — an item-level credit still shrinks the whole invoice's room. */
export function sumApprovedCorrectionsForInvoice(corrections: CorrectionLike[], invoiceId: string): number {
  return corrections
    .filter((c) => (c.type === 'CREDIT_NOTE' || c.type === 'WRITE_OFF') && c.targetInvoiceId === invoiceId)
    .reduce((sum, c) => sum + c.amount, 0);
}

/** Matches creditableAmount's item-level "credited" sum: only rows scoped
 * to this exact line. */
export function sumApprovedCorrectionsForItem(corrections: CorrectionLike[], itemId: string): number {
  return corrections
    .filter((c) => (c.type === 'CREDIT_NOTE' || c.type === 'WRITE_OFF') && c.targetInvoiceItemId === itemId)
    .reduce((sum, c) => sum + c.amount, 0);
}

export function creditNoteCapPreview(baseAmount: number, priorApprovedCredited: number): number {
  return Math.max(0, baseAmount - priorApprovedCredited);
}

export function refundCapPreview(balance: number, sign: 'OWES' | 'ADVANCE' | 'ZERO'): number {
  return sign === 'ADVANCE' ? balance : 0;
}

export function writeOffCapPreview(
  invoiceTarget: { balance: number; priorApprovedCredited: number } | null,
  balance: number,
  sign: 'OWES' | 'ADVANCE' | 'ZERO',
): number {
  if (invoiceTarget) return Math.max(0, invoiceTarget.balance - invoiceTarget.priorApprovedCredited);
  return sign === 'OWES' ? balance : 0;
}

export interface CreditNoteDraftFields {
  studentId: string;
  academicYearId: string;
  targetInvoiceId: string;
  amount: string;
  reasonId: string;
}
export interface RefundDraftFields {
  studentId: string;
  academicYearId: string;
  amount: string;
  reasonId: string;
  refundMethod: RefundMethod;
  refundReference: string;
}
export interface WriteOffDraftFields {
  studentId: string;
  academicYearId: string;
  targetInvoiceId: string;
  amount: string;
  reasonId: string;
}

/** New Correction page's submit gate, one rule per type — mirrors the
 * backend DTOs' own required fields (bill-correction.dto.ts) plus
 * CreateRefundDto's BANK_TRANSFER-needs-a-reference rule. */
export function canSubmitCorrection(
  type: BillCorrectionType,
  fields: CreditNoteDraftFields | RefundDraftFields | WriteOffDraftFields,
): boolean {
  if (!fields.studentId || !fields.academicYearId) return false;
  if (!(Number(fields.amount) > 0)) return false;
  if (!fields.reasonId) return false;

  if (type === 'CREDIT_NOTE') {
    const f = fields as CreditNoteDraftFields;
    return !!f.targetInvoiceId;
  }
  if (type === 'REFUND') {
    const f = fields as RefundDraftFields;
    if (f.refundMethod === 'BANK_TRANSFER' && !f.refundReference) return false;
    return true;
  }
  // WRITE_OFF — targetInvoiceId is optional (balance-level write-off).
  return true;
}

/** Decide dialog's submit gate (ruling 2, refined) — a note is required to
 * reject (the audit trail needs a real "why" for a refusal), optional to
 * approve (the request's own reason code already carries the "why"). */
export function canSubmitDecision(action: 'approve' | 'reject', note: string): boolean {
  if (action === 'reject') return note.trim().length > 0;
  return true;
}
