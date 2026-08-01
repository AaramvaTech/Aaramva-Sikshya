/**
 * BILL-6 §2/§6-test-9: gapless correction numbering via the same `sequences`
 * table as invoice/receipt numbers, own doctype "correction" so it never
 * shares a counter with either. CONTINUOUS only — no fiscal-year-reset
 * variant this checkpoint (not asked for; the reset toggle stays scoped to
 * invoice/receipt numbering per B4-10/B5-8).
 */
export function buildCorrectionSequenceKey(tenantSlug: string): string {
  return `correction:${tenantSlug}:CONTINUOUS`;
}

/** COR-<bsYear>-NNNNNN. bsYear is a display label only (today's BS year at
 * request time) — the counter itself never resets, tracked by the stable key
 * above, same convention as buildInvoiceNumber's CONTINUOUS branch. */
export function buildCorrectionNumber(bsYear: number, seqValue: bigint | number): string {
  const padded = seqValue.toString().padStart(6, '0');
  return `COR-${bsYear}-${padded}`;
}
