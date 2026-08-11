import type { BillRunScope, BillRunStatus } from '@/types/api.types';

/** Shared between the list page and the review page's header badge. */
export const BILL_RUN_STATUS_STYLES: Record<BillRunStatus, string> = {
  DRAFT: 'bg-warning-50 text-warning-700',
  POSTING: 'bg-brand-50 text-brand-700',
  POSTED: 'bg-success-50 text-success-700',
  VOIDED: 'bg-gray-100 text-gray-600',
};

export interface BillRunDraftFields {
  academicYearId: string;
  scope: BillRunScope;
  classId: string;
  bsYear: number;
  bsMonth: number;
}

/** UI-3-SPEC.md §5.2 — create-draft dialog's submit gate. classId is only
 * required when scope is CLASS (mirrors CreateBillRunDto's own validation,
 * checked service-side since this codebase doesn't have a bespoke
 * @ValidateIf-style validator for that shape yet — same convention noted on
 * CreateBillRunDto itself). */
export function canSubmitBillRunDraft(fields: BillRunDraftFields): boolean {
  return (
    !!fields.academicYearId &&
    !!fields.bsYear &&
    !!fields.bsMonth &&
    (fields.scope === 'CLASS' ? !!fields.classId : true)
  );
}
