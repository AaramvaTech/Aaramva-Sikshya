/**
 * R13: "Sequence keys are namespaced: <doctype>:<tenantSlug>:<fiscalYearBs>".
 * B4-10: "with the tenant's reset policy (default CONTINUOUS)". No tenant
 * setting for reset-per-fiscal-year exists anywhere in the codebase (checked:
 * no such column on public.tenants) — Checkpoint B supports CONTINUOUS only,
 * with the fiscalYearBs segment fixed to the literal 'CONTINUOUS' rather than
 * a real "tenant inception year" lookup (which would need a new cross-schema
 * query for a value that, under CONTINUOUS, only needs to never change).
 * Flagged in BILL-BUGS.md — full reset-policy support (and the tenant
 * setting that would toggle it, tested by Checkpoint C's numbering-
 * gaplessness edge case) is a later phase's job, not invented here.
 *
 * Deliberately its OWN namespace ("bill_invoice"), not the old flat
 * "invoice_seq" key `invoice.service.ts` still uses — bill_invoices is a
 * separate document series (B4-1), so the two must never share a counter.
 */
export function buildInvoiceSequenceKey(tenantSlug: string): string {
  return `bill_invoice:${tenantSlug}:CONTINUOUS`;
}

/**
 * Visible invoice number. bsYear here is the CURRENT bs year at post time
 * (matches the old system's own `INV-<bsYear>-NNNNNN` convention — the BS
 * year is a display label only, per R13's own text; the counter itself
 * never resets, tracked separately by buildInvoiceSequenceKey's stable key).
 * "BINV" prefix (not "INV") distinguishes the new bill_invoices series from
 * the old invoices table's numbers at a glance (same reasoning as BUGS-3's
 * bill_ table-name prefix).
 */
export function buildInvoiceNumber(bsYear: number, seqValue: bigint | number): string {
  return `BINV-${bsYear}-${seqValue.toString().padStart(6, '0')}`;
}
