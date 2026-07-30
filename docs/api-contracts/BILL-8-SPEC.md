# BILL-8-SPEC — Print engine (bills & receipts)

**Target path in repo:** `docs/api-contracts/BILL-8-SPEC.md`
**Branch:** `feat/bill-8-printing`
**Depends on:** BILL-0–5 (merged). Consumes `bill_invoices`, `bill_invoice_items`, `bill_payments`, tenant header fields (BILL-1: `pan_number`, `registration_number`, `address`, `phone`, `website`, `logo_url`, `tagline`, `payment_instructions`, `qr_image_url`, plus `principal_name`, `principal_signature_url`, `school_stamp_url`), and `amountInWords` (BILL-0).
**Covers:** rendering a posted invoice to an A4 PDF bill, a payment to an 80mm thermal receipt, the concession-footing fix, the Devanagari native-check gate, and bulk print as a background job.
**Out of scope:** A5 format (deferred), dynamic per-invoice QR (deferred — static tenant QR only), late-fee lines (BILL-7), collection reports (BILL-9).

---

## 0. What this phase does and does not do

**Does:** turn a `bill_invoice` into an A4 PDF that mirrors the Ullens Kathmandu reference layout, turn a `bill_payment` into an 80mm thermal receipt, store both in MinIO, and return presigned download links. Resolve the transport-concession footing gap so printed line items always sum to the header total. Gate the Devanagari amount-in-words behind a native-speaker review before it can appear on a real document. Provide a bulk "print a whole run/class" background job producing one merged PDF.

**Does not:** print A5, generate a unique QR per invoice (uses the tenant's static uploaded QR), or re-render a reprint from live data — a reprint returns the byte-identical stored PDF snapshotted at generation time.

---

## 1. Locked rulings (inherited + this phase)

| # | Ruling |
|---|---|
| R1–R15 + B4/B5 | All prior rulings hold. Money via `Money`, snapshotting discipline, gross/concession separate, BS-aware dates, gateway rail behaviour unchanged, never self-schedule. |
| B8-1 | ~~HTML template → PDF via headless Chromium~~ **REVERSED 2026-07-30 (Checkpoint A discovery):** renders via **pdfkit**, the codebase's existing renderer (`examination/pdf.service.ts`, report cards) — reused, not reimplemented, including its font-embedding/script-detection pattern. See BILL-BUGS.md for the full reasoning; this is now the locked ruling. |
| B8-2 | **A4 bill + 80mm thermal receipt in v1.** A5 deferred. |
| B8-3 | **Reprints are byte-identical.** The PDF is generated once, stored in MinIO, and a reprint returns the same stored object. Figures, tax rate, and dates are snapshotted at generation — never recomputed from live data. A bill printed next fiscal year shows the rate that applied when it was posted. |
| B8-4 | **Bill layout mirrors the Ullens reference:** header (logo, school block, tagline), PAN in a boxed field, "Invoice" label, student/class/installment line, dual AD/BS issue+due dates, itemized fee table with Non-Taxable / Taxable / Total columns, Less: Scholarship/Discount, tax row (prints only if a rate is snapshotted on the invoice), Grand Total, Dr/Cr Previous Balance (signed header figure, not a line — R9), Total Receivable, amount-in-words, payment-instructions block + QR image, "For: {School}" signature line with optional stamp/signature image. |
| B8-5 | **Bilingual template**, tenant picks English / Nepali / both. Labels and amount-in-words honour the choice. |
| B8-6 | **Devanagari amount-in-words gate.** The `amountInWords(m,'ne')` output must pass a native-speaker review (per the I18N-1 precedent) before any tenant with a Nepali/bilingual setting can generate a real document. Until reviewed, the Nepali string is generated but flagged, and a tenant cannot enable Nepali print output. This closes the standing "Nepali amount-in-words review" debt. |
| B8-7 | **Transport-concession footing fix.** When a whole-bill concession (`student_concessions.fee_head_id IS NULL`) coexists with transport, the concession is **apportioned across all line items including transport** so the printed line items sum exactly to the header net. This closes the "must-resolve-before-BILL-8" debt (BILL-4 Checkpoint C / TRANSPORT-ITEM). Apportionment is proportional to each line's gross, with the rounding remainder placed on the largest line so the sum is exact to the paisa. |
| B8-8 | **Static tenant QR.** The bill embeds the tenant's uploaded `qr_image_url` + `payment_instructions` text. No per-invoice dynamic QR in v1. |
| B8-9 | **Bulk print is a background job** (established scheduler/outbox pattern) producing one merged PDF to MinIO with a presigned link. Single-document print is synchronous. |
| B8-10 | **Access:** generate/download bills & receipts is `ACCOUNTANT_AND_ABOVE`; a **PARENT can download their own child's** bill/receipt PDF only (object-scoped, IDOR-proof). |
| B8-11 | **Generated PDFs are immutable artifacts.** Stored under a deterministic MinIO key including the invoice/payment id and a generation version; never overwritten. If a document must change (it shouldn't — invoices are immutable), a new versioned object is written and the old retained. |

---

## 2. The footing fix — the one real logic change (B8-7)

Everything else in this phase is rendering. This is the one arithmetic change, and it must be correct because it prints.

Today: a whole-bill concession reduces the invoice's aggregate net, but individual `bill_invoice_items` carry `concession_amount = 0` for the whole-bill portion (and transport always carries 0). So summing the printed line nets does not equal the header net when a whole-bill concession exists.

Fix: at **render time only** (not by mutating stored invoice rows — those are immutable), compute a per-line concession apportionment:

- For each line, `apportioned_concession = whole_bill_concession × (line_gross / total_gross)`, rounded to 2dp via `Money`.
- The rounding remainder (so the parts sum exactly to the whole) is placed on the largest-gross line.
- Each printed line shows `gross`, its apportioned concession, and `net = gross − apportioned`. The sum of printed line nets now equals the header net exactly.
- Any line-specific concession (`fee_head_id` set) is shown on its own line as today and excluded from the apportionment base.

This is a **presentation-layer computation** producing a correct-footing document from immutable data. It does not change the ledger, the invoice, or any stored amount. A test asserts: for an invoice with a whole-bill concession + transport, `sum(printed line nets) == header net` to the paisa.

*(If discovery shows whole-bill-concession-with-transport never actually occurs in real data, the fix is still built — it's a printed-document correctness guarantee, not an optional optimisation.)*

---

## 3. Discovery (Checkpoint A, first task — no rendering yet)

Report before building:
1. **Existing PDF/render capability** — is Puppeteer, Playwright, `html-pdf`, or any headless-Chromium renderer already a dependency? Is Chromium available on the VPS, or does it need install? (Headless Chromium on a 1 vCPU / 4GB VPS is heavy — confirm it runs, and whether a single shared browser instance / pool is needed.)
2. **MinIO usage** — the existing upload/presign helper the codebase already uses (credential deliveries or elsewhere), so bills reuse it rather than a new client.
3. **Tenant header fields** — confirm all fields in the dependency list exist and are populated for demo; report any NULLs that would render as blanks.
4. **Fonts** — is a Devanagari-capable font available to the renderer? A Nepali bill needs a font with full Devanagari coverage (e.g. Noto Sans Devanagari) embedded, or Nepali text renders as boxes. This is the print equivalent of the ReportLab glyph trap.
5. **Existing bill/receipt print code** — does any old print path exist for the old `invoices` table? Report it; it is not reused, but it may be a reference.

**CHECKPOINT A gate:** discovery report reviewed before any rendering is built. **Resolved 2026-07-30:** item 1 (renderer choice) settled by reversing B8-1 to pdfkit — no Chromium, no VPS memory risk, no Dockerfile changes needed. Item 4 (Devanagari font) closed by the same decision: pdfkit already embeds Noto Sans Devanagari with a working script-detection pattern (`pickFont`), reused verbatim via a new shared `common/pdf/` util. Items 2, 3, 5 stand as reported (MinIO: reuse `StorageService` + one new additive `putObject`; tenant header fields: none populated for `demo`, being fixture-populated before the live proof; no legacy print path exists).

---

## 4. Tables / storage

Likely **no new tables** — generated PDFs live in MinIO, referenced by deterministic key. If a lookup index is wanted:

```
bill_documents            -- optional, only if discovery shows a need for a queryable index
  id, doc_type CHECK IN ('BILL','RECEIPT'),
  ref_id UUID,            -- bill_invoice_id or bill_payment_id
  minio_key TEXT UNIQUE, generation_version INT,
  language CHECK IN ('EN','NE','BILINGUAL'),
  page_size CHECK IN ('A4','THERMAL_80MM'),
  generated_by, generated_at
```

Default: reconstruct the MinIO key deterministically from the ref id + version and skip the table unless discovery argues for it. Raised, not decided unilaterally.

---

## 5. Endpoints

- `GET /finance/bill/invoices/:id/pdf` — generate-or-fetch the A4 bill PDF, return presigned link. `ACCOUNTANT_AND_ABOVE`; PARENT object-scoped to own child.
- `GET /finance/bill/payments/:id/receipt` — the 80mm thermal receipt PDF, presigned link. Same access.
- `POST /finance/bill/runs/:id/print` — bulk-print all posted invoices in a run as one merged PDF; background job, returns job id; reuse `GET /finance/jobs/:id`.
- `POST /finance/bill/print/class` — bulk-print by class+period, same job shape.
- `GET /finance/students/:studentId/bill/invoices/:id/pdf` — parent-facing own-child bill. Object-scoped.

Language + page-size are resolved from tenant settings with optional query override for staff.

---

## 6. Tests (each proven live where it touches data; visual output eyeballed)

1. **Bill renders** for a real demo invoice: PDF produced, stored in MinIO, presigned link resolves, and a `pdftotext`/extraction check confirms the key fields are present (invoice number, student, both dates, totals, amount-in-words).
2. **Footing (B8-7):** an invoice with a whole-bill concession + transport — `sum(printed line nets) == header net` to the paisa. The load-bearing test of this phase.
3. **Reprint is byte-identical** — second fetch returns the same MinIO object (same key, same bytes), not a re-render.
4. **Snapshot integrity** — generate a bill, then change the live tax rate, then reprint: the reprint still shows the original snapshotted rate.
5. **Thermal receipt** renders at 80mm width for a real payment with receipt number.
6. **Devanagari gate (B8-6):** a tenant without native-review-approved Nepali cannot generate a Nepali/bilingual document (blocked with a clear reason); the English document generates fine.
7. **Devanagari rendering** — when enabled, Nepali text renders as real Devanagari glyphs, not boxes (font embedded). Verified by extraction + visual check.
8. **Bulk print** of a run produces one merged PDF with one page-set per student; background job completes with progress.
9. **Cross-tenant probe** on every endpoint; **IDOR** — a parent downloads only their own child's bill/receipt (403 otherwise).

---

## 7. Checkpoints (phase-gated, stop at each)

**CHECKPOINT A — discovery + single A4 bill.** The discovery report (§3), then the A4 bill template and single-invoice PDF generation to MinIO with presigned download. Live proof: a real demo invoice rendered, stored, link resolving, key fields extractable, snapshot + byte-identical-reprint proven. **Includes the footing fix (§2)** with its exact-to-paisa test. Raw build + test count. Provide the rendered PDF for me to eyeball against the Ullens reference.

**CHECKPOINT B — thermal receipt + Devanagari gate.** The 80mm receipt template; the Devanagari native-review gate wired so Nepali output is blocked until approved. Live proof: a receipt rendered; the gate blocking an unreviewed Nepali document while English generates; and — once you supply the native-speaker review — the Devanagari rendering with real glyphs. Provide rendered receipt + a Nepali bill sample for review. Raw build + test count.

**CHECKPOINT C — bulk print.** The background bulk-print job (run + class), merged PDF to MinIO. Live proof: a whole-class run printed as one PDF, job progress, presigned link. Cross-tenant + IDOR probes across all endpoints. Raw build + test count.

Standard proof rules (BILL-SPEC §8) throughout: live HTTP + raw read-backs, raw terminal output per checkpoint, branch + PR, CI green, Claude Code never merges, deviations logged and raised, never self-schedule.

---

## 8. A required human step — the Devanagari review

Checkpoint B cannot fully close without a **native Nepali speaker reviewing the Devanagari amount-in-words output** on a real sample bill. This is Srijan's action (or a delegate's), mirroring I18N-1. Claude Code generates the sample; a human confirms the words are correct and idiomatic (e.g. that 49,800 reads correctly in the lakh system in Nepali) before Nepali print output is enabled for any tenant. Until then the gate stays closed and English print is unaffected.

---

## 9. What this unlocks / what remains after

- **BILL-6** — credit notes, cash refunds, write-offs.
- **BILL-7** — late-fee scheduler.
- **BILL-9** — collection reports, daybook, defaulters, aging, cashier close.
- **Before any real school cutover** (tracked in the runbook): PAY-UI-REPOINT (mobile Pay button → `bill_invoices`), the non-superuser Postgres role, and PAY-2-SANDBOX (Khalti) whenever signup is done. Printing does not change these gates.
