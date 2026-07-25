import { toMoney } from './finance.entity';

// ─── DB row shapes ────────────────────────────────────────────────────────────

export interface LedgerEntryRow {
  id: string;
  student_id: string;
  academic_year_id: string;
  entry_date: Date | string;
  entry_bs_year: number | null;
  entry_bs_month: number | null;
  entry_bs_day: number | null;
  entry_type: string;
  debit: string | number;
  credit: string | number;
  ref_doc_type: string | null;
  ref_doc_id: string | null;
  narration: string | null;
  reverses_entry_id: string | null;
  created_by: string;
  created_at: Date | string;
  running_balance?: string | number; // only present on statement rows (window function)
}

export interface LedgerEntryResponseDto {
  id: string;
  studentId: string;
  academicYearId: string;
  entryDate: string;
  entryBs: { year: number; month: number; day: number } | null;
  entryType: string;
  debit: number;
  credit: number;
  refDocType: string | null;
  refDocId: string | null;
  narration: string | null;
  reversesEntryId: string | null;
  createdBy: string;
  createdAt: string;
  runningBalance?: number;
}

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

function toDateOnly(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().split('T')[0];
}

export function toLedgerEntryResponse(row: LedgerEntryRow): LedgerEntryResponseDto {
  return {
    id: row.id,
    studentId: row.student_id,
    academicYearId: row.academic_year_id,
    entryDate: toDateOnly(row.entry_date),
    entryBs: row.entry_bs_year != null && row.entry_bs_month != null && row.entry_bs_day != null
      ? { year: row.entry_bs_year, month: row.entry_bs_month, day: row.entry_bs_day }
      : null,
    entryType: row.entry_type,
    debit: toMoney(row.debit).toNumber(),
    credit: toMoney(row.credit).toNumber(),
    refDocType: row.ref_doc_type,
    refDocId: row.ref_doc_id,
    narration: row.narration,
    reversesEntryId: row.reverses_entry_id,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    ...(row.running_balance !== undefined ? { runningBalance: toMoney(row.running_balance).toNumber() } : {}),
  };
}
