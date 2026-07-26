// ─── DB row shapes ────────────────────────────────────────────────────────────

export interface BillRunRow {
  id: string;
  academic_year_id: string;
  bs_year: number;
  bs_month: number;
  scope: string;
  class_id: string | null;
  status: string;
  issue_date: Date | string;
  due_date: Date | string;
  total_students: number;
  total_gross: string | number;
  total_concession: string | number;
  total_tax: string | number;
  total_net: string | number;
  idempotency_key: string;
  created_by: string;
  posted_by: string | null;
  posted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface BillRunLineRow {
  id: string;
  bill_run_id: string;
  student_id: string;
  outcome: string;
  skip_reason: string | null;
  bill_invoice_id: string | null;
  gross: string | number;
  concession: string | number;
  tax: string | number;
  net: string | number;
  created_at: Date | string;
  student_name?: string;
  admission_number?: string;
  total_count?: string;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export interface BillRunResponseDto {
  id: string;
  academicYearId: string;
  bsYear: number;
  bsMonth: number;
  scope: string;
  classId: string | null;
  status: string;
  issueDate: string;
  dueDate: string;
  totalStudents: number;
  totalGross: number;
  totalConcession: number;
  totalTax: number;
  totalNet: number;
  createdBy: string;
  postedBy: string | null;
  postedAt: string | null;
  createdAt: string;
}

export interface BillRunLineResponseDto {
  id: string;
  billRunId: string;
  studentId: string;
  studentName?: string;
  admissionNumber?: string;
  outcome: string;
  skipReason: string | null;
  billInvoiceId: string | null;
  gross: number;
  concession: number;
  tax: number;
  net: number;
  createdAt: string;
}

export type BillRunSummaryResponseDto = BillRunResponseDto & {
  outcomeSummary: Record<string, number>;
};

export type BillRunDetailResponseDto = BillRunResponseDto & {
  lines: BillRunLineResponseDto[];
  outcomeSummary: Record<string, number>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Local copies, not shared with finance.entity.ts / bill-assignment.entity.ts —
// matches this codebase's established "one private copy per file" convention
// (see BILL-2's BILL-BUGS.md note on FeePreviewService's guardian-ownership check).

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

function toDateOnly(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().split('T')[0];
}

function toNum(v: string | number): number {
  return typeof v === 'number' ? v : parseFloat(v);
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function toBillRunResponse(row: BillRunRow): BillRunResponseDto {
  return {
    id: row.id,
    academicYearId: row.academic_year_id,
    bsYear: row.bs_year,
    bsMonth: row.bs_month,
    scope: row.scope,
    classId: row.class_id,
    status: row.status,
    issueDate: toDateOnly(row.issue_date),
    dueDate: toDateOnly(row.due_date),
    totalStudents: row.total_students,
    totalGross: toNum(row.total_gross),
    totalConcession: toNum(row.total_concession),
    totalTax: toNum(row.total_tax),
    totalNet: toNum(row.total_net),
    createdBy: row.created_by,
    postedBy: row.posted_by,
    postedAt: row.posted_at ? toIso(row.posted_at) : null,
    createdAt: toIso(row.created_at),
  };
}

export function toBillRunLineResponse(row: BillRunLineRow): BillRunLineResponseDto {
  return {
    id: row.id,
    billRunId: row.bill_run_id,
    studentId: row.student_id,
    studentName: row.student_name,
    admissionNumber: row.admission_number,
    outcome: row.outcome,
    skipReason: row.skip_reason,
    billInvoiceId: row.bill_invoice_id,
    gross: toNum(row.gross),
    concession: toNum(row.concession),
    tax: toNum(row.tax),
    net: toNum(row.net),
    createdAt: toIso(row.created_at),
  };
}
