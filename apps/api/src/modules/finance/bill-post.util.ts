/**
 * Nepali fiscal year starts 1 Shrawan (BS month 4, per CLAUDE.md). Baisakh
 * through Ashadh (months 1-3) of a BS year still belong to the PREVIOUS
 * fiscal year (which started the prior Shrawan); Shrawan onward starts the
 * new one, matching the BS year's own number.
 */
export function fiscalYearBs(bsYear: number, bsMonth: number): number {
  return bsMonth < 4 ? bsYear - 1 : bsYear;
}

/**
 * R13: "Sequence keys are namespaced: <doctype>:<tenantSlug>:<fiscalYearBs>".
 * B4-10 / Checkpoint C: reset-per-fiscal-year is now a real per-tenant
 * setting (FinanceSettingsService, tenants.invoiceNumberingReset — added
 * this checkpoint; Checkpoint B built CONTINUOUS-only since no such column
 * existed yet). CONTINUOUS keeps the fiscalYearBs segment fixed to the
 * literal 'CONTINUOUS' (stable forever, never resets); RESET uses the real
 * fiscal-year number so the counter advances at each fiscal-year boundary.
 *
 * Deliberately its OWN namespace ("bill_invoice"), not the old flat
 * "invoice_seq" key `invoice.service.ts` still uses — bill_invoices is a
 * separate document series (B4-1), so the two must never share a counter.
 */
export function buildInvoiceSequenceKey(
  tenantSlug: string,
  resetPerFiscalYear: boolean,
  fiscalYearBsValue: number,
): string {
  return resetPerFiscalYear
    ? `bill_invoice:${tenantSlug}:${fiscalYearBsValue}`
    : `bill_invoice:${tenantSlug}:CONTINUOUS`;
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
