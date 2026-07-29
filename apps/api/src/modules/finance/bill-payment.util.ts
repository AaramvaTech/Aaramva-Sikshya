/**
 * B5-8: gapless receipt numbering via the SAME R13 sequence machinery as
 * invoice numbers (bill-post.util.ts's buildInvoiceSequenceKey/
 * buildInvoiceNumber) — own doctype "receipt" so the two series never share
 * a counter (mirrors that file's own comment on why bill_invoice is its own
 * namespace, not sharing invoice.service.ts's flat "invoice_seq" key).
 *
 * Applies the FIX-RESET-COLLISION lesson (BILL-BUGS.md) from day one instead
 * of discovering the identical collision fresh for receipts later: the
 * visible string itself disambiguates which sequence key produced it, not
 * just the underlying counter value.
 */
export function buildReceiptSequenceKey(
  tenantSlug: string,
  resetPerFiscalYear: boolean,
  fiscalYearBsValue: number,
): string {
  return resetPerFiscalYear
    ? `receipt:${tenantSlug}:${fiscalYearBsValue}`
    : `receipt:${tenantSlug}:CONTINUOUS`;
}

/**
 * CONTINUOUS: RCPT-<bsYear>-NNNNNN. RESET: RCPT-R<fiscalYear>-NNNNNN — the
 * literal "R" right after "RCPT-" can never appear in that position in a
 * CONTINUOUS string (always a digit there), so the two modes are
 * structurally incapable of colliding regardless of either counter's value.
 */
export function buildReceiptNumber(
  resetPerFiscalYear: boolean,
  bsYear: number,
  fiscalYearBsValue: number,
  seqValue: bigint | number,
): string {
  const padded = seqValue.toString().padStart(6, '0');
  return resetPerFiscalYear ? `RCPT-R${fiscalYearBsValue}-${padded}` : `RCPT-${bsYear}-${padded}`;
}
