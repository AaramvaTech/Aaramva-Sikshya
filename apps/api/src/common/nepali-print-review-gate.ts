/**
 * BILL-8 B8-6 — the Devanagari native-speaker review gate.
 *
 * The review is of the OUTPUT of Nepali billing print as a whole — both
 * `amountInWords(m, 'ne')` (the number-reading correctness B8-6 names
 * explicitly, e.g. that 49,800 reads correctly in the lakh system) and the
 * fixed Nepali labels this checkpoint adds (bill-labels.ts) — since B8-6's
 * own wording is "before any tenant ... can generate a real document", not
 * narrowly scoped to one field. Neither has had a native-speaker pass yet.
 *
 * This is a single global switch, not per-tenant: the thing being reviewed
 * is the shared translation/rendering logic, not tenant data. Mirrors
 * I18N-1's mobile precedent (human review required before shipping Nepali
 * output), but enforced as a real runtime gate here (B8-6 requires a tenant
 * literally cannot enable Nepali/bilingual print until reviewed), not just
 * a PR-merge gate.
 *
 * ONLY Srijan flips this — via an explicit, separate, reviewable commit
 * once he's confirmed the native-speaker review. Never set to true as a
 * side effect of any other change.
 *
 * REVIEWED 2026-07-30: Srijan confirmed the Devanagari sample bill +
 * receipt to a native Nepali reader — amount-in-words and fixed labels
 * read correctly. Flagged "for now" (not a certified/final sign-off) —
 * revisit if he raises specific strings later.
 */
export const NEPALI_PRINT_REVIEWED = true;

/**
 * BILL-PRINT-1 — a SECOND gate, for the keyset this ticket added.
 *
 * The flag above was flipped on 2026-07-30 against the label set as it stood
 * THEN. BILL-PRINT-1 added ~20 new keys (copy designations, the party block's
 * Class/Sec., Roll, Student ID, Guardian, the footer's Remarks / Received by /
 * Authorised signature, the computer-generated notices, the continuation-row
 * wording, and more). Those strings were lifted verbatim from the approved
 * design references — design-supplied, which is NOT the same as
 * native-speaker-reviewed.
 *
 * It is deliberately a separate constant rather than flipping the one above
 * back to false: that would falsely claim the 2026-07-30 review never
 * happened. Both must be true for Nepali to reach a parent.
 *
 * Five keys also DIVERGE between the reviewed set and the design's proposal
 * (due, nonTaxable, taxable, totalReceivable, paidTowards). The reviewed
 * string wins in code today; the design's variants are recorded as candidates
 * in docs/design/billing-print/BILL-PRINT-1-nepali-review.md and are not
 * adopted until the same review rules on them. A gate that a design file can
 * silently overwrite is not a gate.
 *
 * ONLY Srijan flips this, in its own reviewable commit, once the review sheet
 * comes back — and it pairs with the container render (D6): both must clear
 * before NE goes live.
 */
export const BILL_PRINT_1_NEPALI_REVIEWED = false;

/**
 * BILL-RCPT-STATUS — a THIRD gate, for this ticket's two keys.
 *
 * `amountTendered` and `subjectToClearance` are the PENDING (uncleared cheque)
 * variant's wording. They land after the BILL-PRINT-1 review sheet had already
 * gone out, so they cannot ride on its round: if that sheet comes back and its
 * flag is flipped, these two would otherwise ship to a parent having been read
 * by nobody.
 *
 * They also carry more risk than an ordinary label. Every other string on the
 * slip names a field; these two are the entire difference between "we have
 * your money" and "we have your cheque". A mistranslation here does not read
 * as a typo, it reads as a receipt.
 *
 * Same rule as the two above: ONLY Srijan flips it, in its own reviewable
 * commit, once the review sheet's Part C comes back.
 */
export const BILL_RCPT_STATUS_NEPALI_REVIEWED = false;

/** Nepali/bilingual print is permitted only when EVERY keyset is reviewed. */
export const NEPALI_PRINT_PERMITTED =
  NEPALI_PRINT_REVIEWED && BILL_PRINT_1_NEPALI_REVIEWED && BILL_RCPT_STATUS_NEPALI_REVIEWED;
