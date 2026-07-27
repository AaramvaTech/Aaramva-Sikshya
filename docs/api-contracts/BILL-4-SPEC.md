# BILL-4-SPEC — Billing run engine

**Target path in repo:** `docs/api-contracts/BILL-4-SPEC.md`
**Branch:** `feat/bill-4-billing-run`
**Depends on:** BILL-0–3 (merged). Consumes the ledger, the fee catalog, `FeePreviewService`, and the sequence infrastructure built in those phases.
**Covers:** the draft → review → post billing run that generates monthly invoices and writes them to the ledger.
**Out of scope:** taking payment (BILL-5), corrections/credit notes (BILL-6), late-fee application (BILL-7), printing (BILL-8), reports beyond the run summary (BILL-9).

---

## 0. What this phase does and does not do

**Does:** for a chosen BS month and class (or whole school), generate a *draft* set of invoices from each student's resolved fees, let the accountant preview and adjust the draft, then *post* it — creating one `bill_invoice` per student and one `INVOICE`-type ledger entry per posted invoice.

**Does not:** take any payment. New invoices live in `bill_invoices`; the eSewa/Khalti rail still credits the old `invoices` table. **A parent cannot pay a BILL-4 invoice online until BILL-5 rewrites the payment side.** This is expected and stated so it is not discovered as a surprise.

The old `invoices` / `invoice_items` / `payments` tables and both gateway controllers remain untouched and running (R10 still in force). Cutover is a separate later spec.

---

## 1. Locked rulings (inherited + this phase)

| # | Ruling |
|---|---|
| R1–R15 | All prior rulings from BILL-SPEC remain in force. Money via `Money`, gross/concession separate, ledger append-only, tax after discount and snapshotted, BS-month periods, due = issue + N days, gateway rail frozen. |
| B4-1 | New invoices live in a **new `bill_invoices` / `bill_invoice_items`** table pair, additive alongside the old ones. Not a rewrite of `invoices`. |
| B4-2 | **Monthly cycle only** in this phase. Quarterly/term deferred. The run takes a target `bsYear` + `bsMonth`. |
| B4-3 | A run is **idempotent per (tenant, academicYear, bsMonth, scope)**. Re-running a period never double-bills; already-invoiced students in that period are skipped and reported. |
| B4-4 | A student with **no active fee-structure assignment** for the year is skipped and listed in the run report — never an error that aborts the whole run. |
| B4-5 | **Proration is per-fee-head** (`fee_heads.proration_policy`): `MONTHLY` heads (tuition, transport) prorate by days when the student's effective-from falls mid-period; `NONE` heads (admission, annual) bill in full or not at all. Confirmed from BILL-1 default. |
| B4-6 | A **posted invoice is immutable.** No edit endpoint. Once posted it has a ledger entry; corrections are credit notes in BILL-6. Adjustments happen only at the *draft* stage, before posting. |
| B4-7 | **Draft → preview → post** is mandatory. No one-click bulk generate-and-post. The draft is inspectable and adjustable; posting is a separate, explicit, idempotent action. |
| B4-8 | **Previous balance** on an invoice is read from `student_account_balances` (or the SQL ledger sum) at post time and snapshotted onto the invoice as a signed figure. It is a header value, never a line item (R9). |
| B4-9 | Tax is computed **after** concession on the taxable base and **snapshotted** onto the invoice and its items (R4, R5). Ships with zero tax rows, so no tax appears unless a rate exists for the invoice date. |
| B4-10 | Invoice numbering uses the R13 namespaced sequence with the tenant's reset policy (default CONTINUOUS), via the existing atomic upsert. A **voided draft never consumes a number**; numbers are assigned only at post time. |
| B4-11 | A **FAILED line is not automatically retried** by a later post/drain — re-posting a run re-selects only `outcome = 'DRAFT'` lines. A failure must surface for a human to review and act on, not silently retry on its own; the run still completes (transitions to POSTED) around a FAILED line, but that line stays FAILED until someone investigates. Confirmed as intentional at Checkpoint C (2026-07-26) — not a shortfall of Checkpoint B's implementation. |

---

## 2. Tables

Migration `00XX_bill_run.sql` (canary demo → all tenants + scratch, per established pattern).

```
bill_runs
  id, academic_year_id,
  bs_year INT, bs_month INT,
  scope CHECK IN ('CLASS','WHOLE_SCHOOL'),
  class_id NULL,                 -- set when scope=CLASS
  status CHECK IN ('DRAFT','POSTING','POSTED','VOIDED') DEFAULT 'DRAFT',
  issue_date DATE, due_date DATE,
  total_students INT, total_gross NUMERIC(14,2),
  total_concession NUMERIC(14,2), total_tax NUMERIC(14,2),
  total_net NUMERIC(14,2),
  idempotency_key TEXT UNIQUE,   -- <tenant>:<yearId>:<bsMonth>:<scope>:<classId?>
  created_by, posted_by NULL, posted_at NULL,
  timestamps, deleted_at
  -- run-level money totals widened to (14,2): school-wide aggregate, not a line

bill_run_lines
  id, bill_run_id ON DELETE CASCADE, student_id,
  outcome CHECK IN ('DRAFT','POSTED','SKIPPED_NO_ASSIGNMENT',
                    'SKIPPED_ALREADY_BILLED','EXCLUDED','FAILED'),
  skip_reason TEXT NULL,
  bill_invoice_id NULL,          -- set once posted
  gross NUMERIC(12,2), concession NUMERIC(12,2),
  tax NUMERIC(12,2), net NUMERIC(12,2),
  created_at
  -- one row per student considered in the run, whatever the outcome

bill_invoices
  id, invoice_number TEXT UNIQUE,     -- assigned at POST only
  student_id, academic_year_id, bill_run_id,
  bs_year INT, bs_month INT,
  issue_date DATE, due_date DATE,
  gross_amount NUMERIC(12,2), concession_amount NUMERIC(12,2),
  taxable_base NUMERIC(12,2),
  tax_rate NUMERIC(5,3) NULL,         -- snapshotted; NULL when no active rate
  tax_amount NUMERIC(12,2) DEFAULT 0,
  net_amount NUMERIC(12,2),           -- gross - concession + tax
  previous_balance NUMERIC(12,2),     -- signed snapshot at post time (B4-8)
  total_receivable NUMERIC(12,2),     -- net + previous_balance
  amount_in_words_en TEXT, amount_in_words_ne TEXT,   -- snapshotted
  status CHECK IN ('POSTED','SETTLED','PARTIALLY_PAID','VOIDED') DEFAULT 'POSTED',
  ledger_entry_id UUID,               -- the INVOICE entry this created
  created_by, timestamps, deleted_at

bill_invoice_items
  id, bill_invoice_id ON DELETE CASCADE,
  fee_head_id, fee_head_name TEXT,    -- snapshotted (survives later renames)
  recurrence TEXT,
  gross_amount NUMERIC(12,2),
  concession_amount NUMERIC(12,2),
  is_taxable BOOLEAN,
  net_amount NUMERIC(12,2),
  proration_note TEXT NULL,           -- e.g. "18/31 days" when prorated
  created_at
```

Everything money-bearing goes through `Money` and `@IsMoneyString()`; run-level aggregates are `(14,2)` because a whole-school gross can exceed the ~99-lakh ceiling of `(12,2)`.

---

## 3. The run lifecycle

**Generate draft** — resolve the roster for the scope, and for each student call the existing `FeePreviewService` for the target period. Each student becomes a `bill_run_line` with an outcome:
- normal → `DRAFT` with computed gross/concession/tax/net
- no active assignment → `SKIPPED_NO_ASSIGNMENT` (B4-4)
- already has a posted `bill_invoice` for this year+month → `SKIPPED_ALREADY_BILLED` (B4-3)

The draft creates `bill_runs` + `bill_run_lines` only. **No `bill_invoices`, no ledger entries, no invoice numbers** at this stage.

**Preview / adjust** — the accountant reads the draft: per-student lines, the skip lists, and run totals. They may **exclude** a student (line → `EXCLUDED`) before posting. Per-student amount tweaks in the draft are done via the existing override/concession mechanism (BILL-2) and a draft *regenerate*, not by hand-editing a run line — this keeps every number traceable to a catalog reason rather than a free-floating edit.

**Post** — explicit, separate call, guarded by the run's `idempotency_key`. Runs as a **background job** (established scheduler/outbox pattern) because a whole-school post can be thousands of invoices on 1 vCPU. For each `DRAFT` line, in a per-student transaction:
1. assign an invoice number from the R13 sequence
2. snapshot previous balance from the ledger
3. insert `bill_invoice` + `bill_invoice_items` with all amounts and words snapshotted
4. insert one `INVOICE` ledger entry (debit = total_receivable's invoice portion; the previous balance is *not* re-posted, it is already in the ledger) under the per-student advisory lock
5. set the line outcome to `POSTED` and link `bill_invoice_id` + `ledger_entry_id`

A student who fails mid-post (e.g. a late-arriving data problem) becomes `FAILED` on their line with the reason, and does **not** abort the rest of the run — same tolerance as BILL-2's bulk assign. Re-posting the run picks up only non-posted lines.

**Void a draft** — a `DRAFT` run can be voided wholesale (no invoices exist yet, nothing to unwind). A `POSTED` run cannot be voided here — its invoices are immutable and corrected via BILL-6.

---

## 4. The ledger-posting invariant — the one that matters most

Posting an invoice must be **exactly one** `INVOICE` ledger entry, and the student's balance after posting must equal the balance before, plus this invoice's net (its own new charge), and nothing else. The previous-balance figure is a *display snapshot* read from the ledger — it must never be re-posted as a second entry, or the student's balance doubles their old debt.

Stated plainly for the test: post an invoice for a student who already owes 5,000. The invoice's own charge is 3,000. After posting, the ledger balance must be 8,000 — not 13,000. The invoice *shows* "previous balance 5,000, this bill 3,000, total receivable 8,000", but only 3,000 enters the ledger.

This is the single subtle trap of the phase and gets its own dedicated live test.

---

## 5. Endpoints

All `ACCOUNTANT_AND_ABOVE`; standard `{success, data, meta}`; soft delete via `deletedAt` where applicable.

- `POST /finance/bill/runs` — generate a draft run (scope + bsYear + bsMonth). Returns run id and summary.
- `GET /finance/bill/runs` — list runs, filterable by year/month/status.
- `GET /finance/bill/runs/:id` — run detail: totals + paginated lines with outcomes and skip reasons.
- `PATCH /finance/bill/runs/:id/exclude` — mark students `EXCLUDED` before posting.
- `POST /finance/bill/runs/:id/regenerate` — rebuild draft lines (picks up override/concession edits made since draft).
- `POST /finance/bill/runs/:id/post` — idempotent post, returns a job id.
- `GET /finance/jobs/:id` — reuse BILL-2's job-status endpoint.
- `DELETE /finance/bill/runs/:id` — void a DRAFT run only.
- `GET /finance/bill/invoices` — list posted invoices, filterable by student/class/period/status.
- `GET /finance/bill/invoices/:id` — full invoice with items and snapshots. Parent object-scoped to own child.
- `GET /finance/students/:studentId/bill/invoices` — a student's invoices. Parent object-scoped.

---

## 6. Tests (each proven live, not mocked)

1. **Draft creates no invoices and no ledger entries** — `SELECT COUNT(*)` on both is unchanged after a draft.
2. **Idempotent post** — posting the same run twice yields the same invoices; the second call posts zero new rows. Invoice numbers are not consumed twice.
3. **The 5,000 + 3,000 = 8,000 invariant** (§4) — the load-bearing test. Ledger gains exactly one entry; balance is 8,000, not 13,000; the invoice's `previous_balance` snapshot reads 5,000.
4. **No-assignment student** → `SKIPPED_NO_ASSIGNMENT`, run continues, student gets no invoice.
5. **Already-billed student** on a re-run → `SKIPPED_ALREADY_BILLED`, no duplicate invoice.
6. **Proration** — a student whose tuition effective-from is mid-month gets a prorated tuition line with a `proration_note`, while their annual fee (`proration_policy=NONE`) bills in full; hand-verified arithmetic.
7. **Tax snapshot** — with a tax rate active for the period, tax is computed on the post-concession base and stored on the invoice; with no rate, `tax_rate` is NULL and `tax_amount` is 0. A later rate change does not alter the already-posted invoice.
8. **Excluded student** gets no invoice and no ledger entry.
9. **Failed line** does not abort the run; re-post completes only the unposted lines.
10. **Voiding a DRAFT** removes the draft cleanly; voiding a POSTED run is rejected.
11. **Invoice number gaplessness** under a concurrent post (parallel transactions).
12. **Cross-tenant probe** on every new endpoint; **IDOR probe** — a parent reads only their own child's invoices (403 otherwise).
13. **Amount-in-words snapshot** matches the net at post time in both en and ne.

---

## 7. Checkpoints (phase-gated, stop at each)

**CHECKPOINT A — tables + draft.** Migration applied canary-first; draft generation working. Live proof: a draft run over the smallest real demo class, `SELECT` showing `bill_runs` + `bill_run_lines` created and **zero** `bill_invoices` / ledger entries. Raw build + test count.

**CHECKPOINT B — post + the core invariant.** Posting works as an idempotent background job. Live proof: post the draft from A; show the 5,000+3,000=8,000 ledger invariant with raw `SELECT`s (balance, the single new INVOICE entry, the invoice's previous_balance snapshot); show a re-post adding zero rows. Raw build + test count.

**CHECKPOINT C — edges.** Proration, tax snapshot, skip outcomes, exclusion, failed-line tolerance, numbering gaplessness, cross-tenant + IDOR. Live proof for proration (hand-verified) and one full end-to-end whole-class run showing every outcome type present in the run report. Raw build + test count.

Standard proof rules from BILL-SPEC §8 apply throughout: live HTTP + `SELECT` read-backs, raw terminal output at each checkpoint, branch + PR, CI green, Claude Code never merges, deviations logged in `BILL-BUGS.md` and raised not decided.

---

## 8. What this unlocks next

Once BILL-4 posts invoices to the ledger, the system finally *bills*. The natural next phases, each its own spec:

- **BILL-5** — payments against `bill_invoices`, allocation, advance auto-apply, cheque lifecycle; and only then re-point eSewa/Khalti at the new table (closing the "can't pay online yet" gap). PAY-1/PAY-2 sandbox proofs happen here, against the new table.
- **BILL-6** — credit notes, refunds, write-offs against posted invoices.
- **BILL-8** — the printed bill, using the real Ullens layout: PAN box, dual AD/BS dates, previous-balance line, amount in words, QR, signature.
