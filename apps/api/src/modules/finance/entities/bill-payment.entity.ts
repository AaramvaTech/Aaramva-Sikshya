import { toMoney } from './finance.entity';

// ─── DB row shapes ────────────────────────────────────────────────────────────

export interface BillPaymentRow {
  id: string;
  receipt_number: string;
  student_id: string;
  academic_year_id: string;
  amount: string | number;
  method: string;
  status: string;
  received_date: Date | string;
  received_bs_year: number | null;
  received_bs_month: number | null;
  received_bs_day: number | null;
  reference: string | null;
  cheque_bank: string | null;
  cheque_date: Date | string | null;
  allocation_mode: string;
  ledger_entry_id: string | null;
  gateway_txn_ref: string | null;
  notes: string | null;
  received_by: string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface BillPaymentAllocationRow {
  id: string;
  bill_payment_id: string;
  bill_invoice_id: string;
  amount: string | number;
  created_at: Date | string;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export interface BillPaymentAllocationResponseDto {
  id: string;
  billInvoiceId: string;
  amount: number;
  createdAt: string;
}

export interface BillPaymentResponseDto {
  id: string;
  receiptNumber: string;
  studentId: string;
  academicYearId: string;
  amount: number;
  method: string;
  status: string;
  receivedDate: string;
  receivedBs: { year: number; month: number; day: number } | null;
  reference: string | null;
  chequeBank: string | null;
  chequeDate: string | null;
  allocationMode: string;
  ledgerEntryId: string | null;
  gatewayTxnRef: string | null;
  notes: string | null;
  receivedBy: string;
  createdAt: string;
  allocations?: BillPaymentAllocationResponseDto[];
  /** Sum of this payment's allocations — only present when allocations were loaded. */
  allocatedAmount?: number;
  /** amount - allocatedAmount — the invariant-proof field: allocations + advanceAmount = amount. */
  advanceAmount?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Local toIso/toDateOnly copies — matches this codebase's established
// "one private copy per file" convention (see bill-invoice.entity.ts's own note).

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

function toDateOnly(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().split('T')[0];
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function toBillPaymentAllocationResponse(row: BillPaymentAllocationRow): BillPaymentAllocationResponseDto {
  return {
    id: row.id,
    billInvoiceId: row.bill_invoice_id,
    amount: toMoney(row.amount).toNumber(),
    createdAt: toIso(row.created_at),
  };
}

export function toBillPaymentResponse(
  row: BillPaymentRow,
  allocations?: BillPaymentAllocationRow[],
): BillPaymentResponseDto {
  const amount = toMoney(row.amount);
  const allocatedAmount = allocations
    ? allocations.reduce((acc, a) => acc.add(toMoney(a.amount)), toMoney(0))
    : undefined;

  return {
    id: row.id,
    receiptNumber: row.receipt_number,
    studentId: row.student_id,
    academicYearId: row.academic_year_id,
    amount: amount.toNumber(),
    method: row.method,
    status: row.status,
    receivedDate: toDateOnly(row.received_date),
    receivedBs: row.received_bs_year != null && row.received_bs_month != null && row.received_bs_day != null
      ? { year: row.received_bs_year, month: row.received_bs_month, day: row.received_bs_day }
      : null,
    reference: row.reference,
    chequeBank: row.cheque_bank,
    chequeDate: row.cheque_date ? toDateOnly(row.cheque_date) : null,
    allocationMode: row.allocation_mode,
    ledgerEntryId: row.ledger_entry_id,
    gatewayTxnRef: row.gateway_txn_ref,
    notes: row.notes,
    receivedBy: row.received_by,
    createdAt: toIso(row.created_at),
    allocations: allocations?.map(toBillPaymentAllocationResponse),
    ...(allocatedAmount !== undefined
      ? { allocatedAmount: allocatedAmount.toNumber(), advanceAmount: amount.sub(allocatedAmount).toNumber() }
      : {}),
  };
}
