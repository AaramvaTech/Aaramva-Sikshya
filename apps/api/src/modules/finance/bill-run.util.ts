/**
 * R8 (inherited): "Due date = issue date + N days, tenant-configurable."
 * No tenant-settings infrastructure for N exists anywhere in the codebase
 * yet (checked: no due_days/dueDays column on tenants or any settings
 * table) — flagged in BILL-BUGS.md rather than inventing one unilaterally
 * for this checkpoint. CreateBillRunDto accepts an explicit per-run
 * `dueDate` override; this constant is only the fallback when omitted.
 */
export const DEFAULT_DUE_DAYS = 15;

/**
 * B4-3: idempotent per (tenant, academicYear, bsMonth, scope). Literal
 * shape from BILL-4-SPEC.md §2's bill_runs DDL comment:
 * "<tenant>:<yearId>:<bsMonth>:<scope>:<classId?>". bsYear is deliberately
 * absent (matches the spec's own comment) — academicYearId already anchors
 * the specific year; one academic_year_id never covers the same BS month
 * twice.
 */
export function buildBillRunIdempotencyKey(
  tenantSlug: string,
  academicYearId: string,
  bsMonth: number,
  scope: string,
  classId?: string | null,
): string {
  return `${tenantSlug}:${academicYearId}:${bsMonth}:${scope}:${classId ?? ''}`;
}

/**
 * Adds `days` to an AD 'YYYY-MM-DD' string. UTC-midnight parse/serialize is
 * TZ-independent here because the input is a STRING (parsed as UTC per the
 * ECMAScript date-only string grammar), not a locally-constructed Date —
 * the FIX-2 gotcha (formatLocalDate vs toISOString) applies to Date objects
 * built from local y/m/d components, which this is not.
 */
export function addDaysToAdString(adDate: string, days: number): string {
  const d = new Date(`${adDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
