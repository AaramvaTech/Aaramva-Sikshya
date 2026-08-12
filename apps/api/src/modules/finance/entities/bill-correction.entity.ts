import { toMoney } from './finance.entity';

// ─── DB row shapes ────────────────────────────────────────────────────────────

export interface CorrectionReasonRow {
  id: string;
  name: string;
  code: string;
  gl_account_code: string | null;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface BillCorrectionRow {
  id: string;
  correction_number: string;
  type: string;
  student_id: string;
  academic_year_id: string;
  target_invoice_id: string | null;
  target_invoice_item_id: string | null;
  amount: string | number;
  reason_id: string;
  refund_method: string | null;
  refund_reference: string | null;
  status: string;
  requested_by: string;
  requested_at: Date | string;
  decided_by: string | null;
  decided_at: Date | string | null;
  decision_note: string | null;
  ledger_entry_id: string | null;
  requires_approval: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
  /** UI-5: only present on findAll/findOne's LEFT JOIN — absent (undefined)
   * on the bare `SELECT * FROM bill_corrections` rows approve/reject/reverse
   * fetch for their own internal status checks. */
  student_name?: string;
  admission_number?: string;
  reason_name?: string | null;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export interface CorrectionReasonResponseDto {
  id: string;
  name: string;
  code: string;
  glAccountCode: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BillCorrectionResponseDto {
  id: string;
  correctionNumber: string;
  type: string;
  studentId: string;
  academicYearId: string;
  targetInvoiceId: string | null;
  targetInvoiceItemId: string | null;
  amount: number;
  reasonId: string;
  refundMethod: string | null;
  refundReference: string | null;
  status: string;
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  ledgerEntryId: string | null;
  requiresApproval: boolean;
  createdAt: string;
  /** UI-5: display-only, only populated by findAll/findOne (see BillCorrectionRow). */
  studentName?: string;
  admissionNumber?: string;
  reasonName?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Local toIso copy — matches this codebase's established "one private copy
// per file" convention (see bill-payment.entity.ts's own note).

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function toCorrectionReasonResponse(row: CorrectionReasonRow): CorrectionReasonResponseDto {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    glAccountCode: row.gl_account_code,
    isActive: row.is_active,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function toBillCorrectionResponse(row: BillCorrectionRow): BillCorrectionResponseDto {
  return {
    id: row.id,
    correctionNumber: row.correction_number,
    type: row.type,
    studentId: row.student_id,
    academicYearId: row.academic_year_id,
    targetInvoiceId: row.target_invoice_id,
    targetInvoiceItemId: row.target_invoice_item_id,
    amount: toMoney(row.amount).toNumber(),
    reasonId: row.reason_id,
    refundMethod: row.refund_method,
    refundReference: row.refund_reference,
    status: row.status,
    requestedBy: row.requested_by,
    requestedAt: toIso(row.requested_at),
    decidedBy: row.decided_by,
    decidedAt: row.decided_at ? toIso(row.decided_at) : null,
    decisionNote: row.decision_note,
    ledgerEntryId: row.ledger_entry_id,
    requiresApproval: row.requires_approval,
    createdAt: toIso(row.created_at),
    ...(row.student_name !== undefined ? { studentName: row.student_name } : {}),
    ...(row.admission_number !== undefined ? { admissionNumber: row.admission_number } : {}),
    ...(row.reason_name !== undefined ? { reasonName: row.reason_name } : {}),
  };
}
