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
