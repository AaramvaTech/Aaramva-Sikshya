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
 * Visible invoice number. FIX-RESET-COLLISION: the string itself must
 * disambiguate which sequence key produced it, not just the underlying
 * counter — CONTINUOUS and a fiscal-year RESET key can each independently
 * reach the same seqValue (e.g. both 1) in the same bsYear, and
 * bill_invoices.invoice_number is a bare, tenant-global UNIQUE constraint,
 * so two textually-identical numbers would otherwise collide (reproduced
 * live at Checkpoint C — see BILL-BUGS.md).
 *
 * CONTINUOUS keeps the exact pre-existing `BINV-<bsYear>-NNNNNN` shape
 * (bsYear = current BS year at post time, a display label only — matches
 * the old system's own `INV-<bsYear>-NNNNNN` convention; the counter itself
 * never resets, tracked by buildInvoiceSequenceKey's stable key) — every
 * already-issued invoice number, and every future CONTINUOUS one, is
 * byte-for-byte unchanged by this fix.
 *
 * RESET inserts a literal "R" immediately after the "BINV-" prefix and uses
 * the fiscal year (not the calendar bsYear) as its label, matching what
 * buildInvoiceSequenceKey actually keys on. "R" can never appear in that
 * position in a CONTINUOUS-mode string (always a digit there), so the two
 * modes are structurally incapable of colliding regardless of what either
 * counter's numeric value is.
 *
 * "BINV" prefix (not "INV") distinguishes the new bill_invoices series from
 * the old invoices table's numbers at a glance (same reasoning as BUGS-3's
 * bill_ table-name prefix).
 */
export function buildInvoiceNumber(
  resetPerFiscalYear: boolean,
  bsYear: number,
  fiscalYearBsValue: number,
  seqValue: bigint | number,
): string {
  const padded = seqValue.toString().padStart(6, '0');
  return resetPerFiscalYear ? `BINV-R${fiscalYearBsValue}-${padded}` : `BINV-${bsYear}-${padded}`;
}
