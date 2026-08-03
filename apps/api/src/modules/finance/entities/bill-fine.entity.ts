import { toMoney } from './finance.entity';

export interface BillFineAccrualRow {
  id: string;
  bill_invoice_id: string;
  student_id: string;
  late_fee_rule_id: string;
  accrued_through: Date | string;
  days_overdue: number;
  total_fine: string | number;
  delta_posted: string | number;
  rule_type_snapshot: string | null;
  rule_value_snapshot: string | number | null;
  rule_cap_snapshot: string | number | null;
  ledger_entry_id: string;
  fine_run_id: string | null;
  created_at: Date | string;
}

export interface BillFineRunRow {
  id: string;
  triggered_by: string;
  triggered_by_user_id: string | null;
  run_date: Date | string;
  started_at: Date | string;
  finished_at: Date | string | null;
  invoices_scanned: number;
  invoices_fined: number;
  total_fine_posted: string | number;
  status: string;
  created_at: Date | string;
  total_count?: string;
}

export interface BillFineAccrualResponseDto {
  id: string;
  billInvoiceId: string;
  studentId: string;
  lateFeeRuleId: string;
  accruedThrough: string;
  daysOverdue: number;
  totalFine: number;
  deltaPosted: number;
  ruleTypeSnapshot: string | null;
  ruleValueSnapshot: number | null;
  ruleCapSnapshot: number | null;
  ledgerEntryId: string;
  fineRunId: string | null;
  createdAt: string;
}

export interface BillFineRunResponseDto {
  id: string;
  triggeredBy: string;
  triggeredByUserId: string | null;
  runDate: string;
  startedAt: string;
  finishedAt: string | null;
  invoicesScanned: number;
  invoicesFined: number;
  totalFinePosted: number;
  status: string;
  createdAt: string;
}

// Local toIso/toDateOnly — matches this codebase's established
// "one private copy per file" convention (see bill-correction.entity.ts).

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

function toDateOnly(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().split('T')[0];
}

export function toBillFineAccrualResponse(row: BillFineAccrualRow): BillFineAccrualResponseDto {
  return {
    id: row.id,
    billInvoiceId: row.bill_invoice_id,
    studentId: row.student_id,
    lateFeeRuleId: row.late_fee_rule_id,
    accruedThrough: toDateOnly(row.accrued_through),
    daysOverdue: row.days_overdue,
    totalFine: toMoney(row.total_fine).toNumber(),
    deltaPosted: toMoney(row.delta_posted).toNumber(),
    ruleTypeSnapshot: row.rule_type_snapshot,
    ruleValueSnapshot: row.rule_value_snapshot != null ? toMoney(row.rule_value_snapshot).toNumber() : null,
    ruleCapSnapshot: row.rule_cap_snapshot != null ? toMoney(row.rule_cap_snapshot).toNumber() : null,
    ledgerEntryId: row.ledger_entry_id,
    fineRunId: row.fine_run_id,
    createdAt: toIso(row.created_at),
  };
}

export function toBillFineRunResponse(row: BillFineRunRow): BillFineRunResponseDto {
  return {
    id: row.id,
    triggeredBy: row.triggered_by,
    triggeredByUserId: row.triggered_by_user_id,
    runDate: toDateOnly(row.run_date),
    startedAt: toIso(row.started_at),
    finishedAt: row.finished_at ? toIso(row.finished_at) : null,
    invoicesScanned: row.invoices_scanned,
    invoicesFined: row.invoices_fined,
    totalFinePosted: toMoney(row.total_fine_posted).toNumber(),
    status: row.status,
    createdAt: toIso(row.created_at),
  };
}
