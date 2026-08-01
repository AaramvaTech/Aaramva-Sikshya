export interface BillPrintJobRow {
  id: string;
  job_type: string;
  ref_run_id: string | null;
  ref_class_id: string | null;
  ref_section_id: string | null;
  ref_bs_year: number | null;
  ref_bs_month: number | null;
  invoice_ids: string[];
  language: string;
  status: string;
  total: number;
  processed: number;
  failed_count: number;
  failures: { invoiceId: string; error: string }[];
  result_key: string | null;
  created_by: string;
  created_at: Date | string;
  started_at: Date | string | null;
  completed_at: Date | string | null;
}

export interface BillPrintJobResponseDto {
  id: string;
  jobType: string;
  refRunId: string | null;
  refClassId: string | null;
  refSectionId: string | null;
  refBsYear: number | null;
  refBsMonth: number | null;
  language: string;
  status: string;
  total: number;
  processed: number;
  failedCount: number;
  failures: { invoiceId: string; error: string }[];
  createdBy: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  /** Only present once status is COMPLETED — presigned on read, not stored. */
  downloadUrl?: string;
}

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

export function toBillPrintJobResponse(row: BillPrintJobRow, downloadUrl?: string): BillPrintJobResponseDto {
  return {
    id: row.id,
    jobType: row.job_type,
    refRunId: row.ref_run_id,
    refClassId: row.ref_class_id,
    refSectionId: row.ref_section_id,
    refBsYear: row.ref_bs_year,
    refBsMonth: row.ref_bs_month,
    language: row.language,
    status: row.status,
    total: row.total,
    processed: row.processed,
    failedCount: row.failed_count,
    failures: row.failures ?? [],
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    startedAt: row.started_at ? toIso(row.started_at) : null,
    completedAt: row.completed_at ? toIso(row.completed_at) : null,
    ...(downloadUrl ? { downloadUrl } : {}),
  };
}
