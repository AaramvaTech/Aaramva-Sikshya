import { toMoney } from './finance.entity';

// ─── DB row shapes ────────────────────────────────────────────────────────────

export interface BillInvoiceRow {
  id: string;
  invoice_number: string | null;
  student_id: string;
  academic_year_id: string;
  bill_run_id: string;
  bs_year: number;
  bs_month: number;
  issue_date: Date | string;
  due_date: Date | string;
  gross_amount: string | number;
  concession_amount: string | number;
  taxable_base: string | number;
  tax_rate: string | number | null;
  tax_amount: string | number;
  net_amount: string | number;
  previous_balance: string | number;
  total_receivable: string | number;
  amount_in_words_en: string | null;
  amount_in_words_ne: string | null;
  status: string;
  ledger_entry_id: string | null;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
  student_name?: string;
  admission_number?: string;
  class_name?: string;
  section_name?: string | null;
  roll_number?: number | null;
  guardian_name?: string | null;
  paid_amount?: string | number;
  balance?: string | number;
}

export interface BillInvoiceItemRow {
  id: string;
  bill_invoice_id: string;
  fee_head_id: string | null;
  transport_route_id: string | null;
  item_name: string;
  recurrence: string | null;
  gross_amount: string | number;
  concession_amount: string | number;
  is_taxable: boolean;
  net_amount: string | number;
  proration_note: string | null;
  created_at: Date | string;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export interface BillInvoiceResponseDto {
  id: string;
  invoiceNumber: string | null;
  studentId: string;
  studentName?: string;
  admissionNumber?: string;
  className?: string;
  /** BILL-PRINT-1 party block — populated by findOne only. */
  sectionName?: string | null;
  rollNumber?: string | null;
  guardianName?: string | null;
  academicYearId: string;
  billRunId: string;
  bsYear: number;
  bsMonth: number;
  issueDate: string;
  dueDate: string;
  grossAmount: number;
  concessionAmount: number;
  taxableBase: number;
  taxRate: number | null;
  taxAmount: number;
  netAmount: number;
  previousBalance: number;
  totalReceivable: number;
  paidAmount: number;
  balance: number;
  amountInWordsEn: string | null;
  amountInWordsNe: string | null;
  status: string;
  ledgerEntryId: string | null;
  createdBy: string;
  createdAt: string;
  items?: BillInvoiceItemResponseDto[];
}

export interface BillInvoiceItemResponseDto {
  id: string;
  feeHeadId: string | null;
  transportRouteId: string | null;
  itemName: string;
  recurrence: string | null;
  grossAmount: number;
  concessionAmount: number;
  isTaxable: boolean;
  netAmount: number;
  prorationNote: string | null;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Local toIso/toDateOnly copies — matches this codebase's established
// "one private copy per file" convention (see bill-run.entity.ts's own note).

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

function toDateOnly(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().split('T')[0];
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function toBillInvoiceResponse(
  row: BillInvoiceRow,
  items?: BillInvoiceItemRow[],
): BillInvoiceResponseDto {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    studentId: row.student_id,
    studentName: row.student_name,
    admissionNumber: row.admission_number,
    className: row.class_name,
    sectionName: row.section_name ?? null,
    rollNumber: row.roll_number != null ? String(row.roll_number) : null,
    guardianName: row.guardian_name ?? null,
    academicYearId: row.academic_year_id,
    billRunId: row.bill_run_id,
    bsYear: row.bs_year,
    bsMonth: row.bs_month,
    issueDate: toDateOnly(row.issue_date),
    dueDate: toDateOnly(row.due_date),
    grossAmount: toMoney(row.gross_amount).toNumber(),
    concessionAmount: toMoney(row.concession_amount).toNumber(),
    taxableBase: toMoney(row.taxable_base).toNumber(),
    taxRate: row.tax_rate != null ? toMoney(row.tax_rate).toNumber() : null,
    taxAmount: toMoney(row.tax_amount).toNumber(),
    netAmount: toMoney(row.net_amount).toNumber(),
    previousBalance: toMoney(row.previous_balance).toNumber(),
    totalReceivable: toMoney(row.total_receivable).toNumber(),
    paidAmount: toMoney(row.paid_amount ?? 0).toNumber(),
    balance: toMoney(row.balance ?? row.total_receivable).toNumber(),
    amountInWordsEn: row.amount_in_words_en,
    amountInWordsNe: row.amount_in_words_ne,
    status: row.status,
    ledgerEntryId: row.ledger_entry_id,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    items: items?.map(toBillInvoiceItemResponse),
  };
}

export function toBillInvoiceItemResponse(row: BillInvoiceItemRow): BillInvoiceItemResponseDto {
  return {
    id: row.id,
    feeHeadId: row.fee_head_id,
    transportRouteId: row.transport_route_id,
    itemName: row.item_name,
    recurrence: row.recurrence,
    grossAmount: toMoney(row.gross_amount).toNumber(),
    concessionAmount: toMoney(row.concession_amount).toNumber(),
    isTaxable: row.is_taxable,
    netAmount: toMoney(row.net_amount).toNumber(),
    prorationNote: row.proration_note,
    createdAt: toIso(row.created_at),
  };
}
