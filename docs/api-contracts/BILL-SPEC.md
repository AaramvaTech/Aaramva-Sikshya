# BILL-SPEC — Billing system rebuild, Phases 0–4

**Target path in repo:** `docs/api-contracts/BILL-SPEC.md`
**Branch:** `feat/bill-ledger-core`
**Covers:** BILL-0 (money hardening) → BILL-3 (ledger core)
**Out of scope for this spec:** BILL-4 (billing runs) onward — separate spec once the ledger is proven.

---

## 0. Why this rebuild exists

The current finance module models **fee assignment**. It cannot express:

- More than one fee structure per class per year — blocked by `UNIQUE(class_id, academic_year_id)` on `fee_structures`. Hosteller vs day scholar is impossible.
- Advance deposits — blocked by `payments.invoice_id NOT NULL`. A deposit has no invoice.
- Gross vs concession reporting — `student_fee_assignments` stores `discount_percent` and free-text `discount_reason`, so "how much did we give away and why" is unanswerable.
- Corrections — there is no reversal concept; a wrongly assigned fee can only be voided or edited.
- Recurrence vs category — `fee_categories.type` mixes `MONTHLY` (a recurrence) with `EXAM` (a kind of fee). An exam fee charged per term cannot be expressed.

The fix is a **student ledger**: an append-only account per student. Once it exists, refunds, reversals, opening balances, advances, carry-forward and "why does this student owe 4,320" all become consequences of one table rather than separate features.

---

## 1. Locked rulings

These are decided. Claude Code does not revisit them.

| # | Ruling |
|---|---|
| R1 | Money arithmetic uses `Decimal`. No `parseFloat`, `Number()`, or `+` on a money value anywhere in the finance module. Aggregation happens in SQL. |
| R2 | Fee structures hold **gross** amounts only. Concessions are a separate layer. Every invoice line carries `gross_amount`, `concession_amount`, `net_amount` separately. |
| R3 | The ledger is **append-only**. No `UPDATE`, no `DELETE`, no `deleted_at`. Corrections are reversal entries. Enforced by a database trigger, not convention. This follows the existing `payment_transactions` precedent. |
| R4 | Tax is computed **after** concession. Order: gross → less concession → taxable base → tax → grand total → ± previous balance → total receivable. |
| R5 | Tax rate and amount are **snapshotted onto the invoice** at posting. Reprints never recompute from the live rate table. |
| R6 | Ships with **zero active tax rate rows**. No tax row prints unless a rate exists for the invoice date. |
| R7 | Billing periods are named by **BS month**. Issue date is independent of period (real schools bill in arrears). |
| R8 | Due date = issue date + N days, tenant-configurable. Not a fixed day of month. |
| R9 | Carry-forward appears as a signed header figure (`Dr / Cr Previous Balance`), never as a line item. |
| R10 | `payment_transactions` and both gateway controllers are **not modified**. Any change to `payments` must leave `EsewaService`, `KhaltiService` and `recordPaymentInTx` compiling and passing unchanged. |
| R11 | `CASHIER` role is **deferred** to a later session. Finance stays on `ACCOUNTANT_AND_ABOVE`. No role-hierarchy changes in this spec. |
| R12 | Bill header fields come from tenant settings. Discovery first — add only what's missing, as nullable columns. |
| R13 | Sequence keys are namespaced: `<doctype>:<tenantSlug>:<fiscalYearBs>`. |
| R14 | Late fee rules are promoted to a rules table supporting `FLAT`, `PER_DAY`, `PERCENT`, with grace days and an optional cap. Ships disabled per tenant. |
| R15 | **No tenant finance tables are truncated.** Phases 0–4 are purely additive — new tables alongside the old, which keep running. Phase 1 money-hardening tests use a disposable scratch schema (`tenant_bill_scratch`), created and dropped by test setup. Live proof through Phases 2–4 uses the **demo** tenant (smallest real dataset). `motherland_school` and `test` are untouched until the Phase 4 cutover, which gets its own spec and dry-run. *(Supersedes the original truncation ruling — see BILL-BUGS.md R15-REVISION; the original assumed only demo held data, but three tenants do, including referenced history.)* |

**Recurrence mapping** (old `fee_categories.type` → new `fee_heads.recurrence`):
`MONTHLY→MONTHLY`, `QUARTERLY→QUARTERLY`, `ANNUALLY→ANNUAL`, `ONE_TIME→ONE_TIME`, `EXAM→ON_DEMAND`.
"Exam fee" becomes a fee head named "Exam fee", not a type.

---

## 2. Table strategy

**Recreated with a superset schema, same names** (preserves the `payment_transactions` FK and the gateway contract): `invoices`, `invoice_items`, `payments`.

**Replaced by new tables** (their constraints are wrong): `fee_categories` → `fee_heads`; `fee_structures`, `fee_structure_items` → same names, new definitions; `student_fee_assignments` → split into `student_fee_overrides` + `student_concessions`.

**Untouched:** `payment_transactions`, `sequences`.

Old tables are dropped in a single cutover migration at the end of Phase 4, after the ledger is proven. Not before.

---

## 3. Phase 0 — Discovery. No writes.

Claude Code produces a written report and **stops**. No migrations, no code, no branch commits beyond creating `BILL-BUGS.md`.

Report must answer, each with the raw command output that proves it:

1. **`pg` NUMERIC parser.** Is a custom type parser registered for OID 1700 anywhere (`pg.types.setTypeParser`)? If yes, every NUMERIC in the app is already a float and this becomes a P0 incident, not a billing task.
2. **Float coercion inventory.** Every site in `apps/api/src/modules/finance/**` where a money value meets `parseFloat`, `Number()`, `+`, `toFixed`, `Math.round`, or arithmetic on a raw query result. File, line, expression. This list is Phase 1's work queue.
3. **`sequences` table location.** Public schema or tenant schema? Current keys and values. Is the increment atomic (`UPDATE ... RETURNING` under a row lock) or read-then-write?
4. **Tenant profile shape.** Which of these already exist on `tenants` or a school-settings table: `pan_number`, `registration_number`, `address`, `phone`, `website`, `logo_url`, `tagline`, `payment_instructions`, `qr_image_url`. Report present/absent for each.
5. **Row counts** in every finance table in the dev tenant, and confirmation that no other tenant schema holds finance rows.
6. **Gateway coupling.** Every column of `invoices` and `payments` that `EsewaService`, `KhaltiService`, `PaymentGatewaysController` or `recordPaymentInTx` reads or writes. This is the frozen surface for R10.
7. **`fine_amount` precision.** Confirm it is `NUMERIC(8,2)` and list any other money column not `NUMERIC(10,2)` or wider.

**CHECKPOINT 0 — Srijan reviews the report before any code is written.**

---

## 4. Phase 1 — Money hardening (BILL-0)

Migration `00XX_money_hardening.sql` plus a `money` utility module.

**Deliverables**

- `apps/api/src/common/money/money.ts` — a `Money` wrapper over `Decimal` (Prisma re-exports decimal.js; usable standalone). Operations: `add`, `sub`, `mul`, `div`, `percentOf`, `compare`, `isZero`, `negate`. Rounding: **half-up to 2dp**, applied at one place only.
- `fromDb(value: string): Money` and `toDb(m: Money): string`. Nothing else converts.
- Every site from the Phase 0 inventory rewritten to use `Money`.
- `amountInWords(m: Money, locale: 'en' | 'ne')` — English uses the **lakh/crore** system ("Four Lakh Ninety-Eight Thousand..."), not millions. Nepali returns Devanagari. Both return the trailing "Rupees" / "रुपैयाँ" and handle paisa.
- Widen the two **`fine_per_day`** columns (`fee_structure_items`, `invoice_items`) from `NUMERIC(8,2)` to `NUMERIC(12,2)`. **Do not** touch `invoices.fine_amount` — it is already `(10,2)` and is frozen by R10 (gateway rail). This corrects the spec's original premise: `fine_amount` was never the narrow column. Widening `fine_per_day` is for uniformity, not overflow risk (a per-day rate never nears the `(8,2)` ceiling). All new money columns are `NUMERIC(12,2)`.
- **`@IsMoneyString()` DTO validator.** The finance DTOs currently type money as JS `number` via `@IsNumber()`, so a value can lose precision in JSON parse *before* `Money` sees it. Add a validator accepting a decimal string (or integer paisa) and migrate `amount`, `customAmount`, `discountPercent`-adjacent money fields, `finePerDay` across `fee-structure.dto.ts`, `invoice.dto.ts`, `payment.dto.ts`. Without this the `Money` discipline has a hole at the API edge. **Exception:** do not alter the eSewa/Khalti request DTOs in a way that changes their wire contract (R10) — the gateway amount handling stays as-is.
- No truncation (R15). Money-hardening tests run against a disposable `tenant_bill_scratch` schema created and dropped by the test harness.

**Tests**

- Property test: for random 2dp decimals, `Money` arithmetic equals the same computation done in Postgres `NUMERIC`. This is the test that would have caught float drift.
- `0.1 + 0.2 === 0.3` in `Money` terms.
- Rounding at the half boundary in both directions.
- `amountInWords` against a fixture table including 49,800 → "Forty-Nine Thousand Eight Hundred Rupees" (matches the reference Ullens bill), 1,00,000, 1,25,50,000, and 0.
- A lint rule or unit test that fails if `parseFloat` or `Number(` appears in `modules/finance/**`.

**CHECKPOINT 1** — raw `tsc --noEmit` output and raw test-count output. Live proof: one `SELECT` showing a `NUMERIC(12,2)` value round-tripping through `fromDb`/`toDb` unchanged.

---

## 5. Phase 2 — Catalog (BILL-1)

Migration `00XX_bill_catalog.sql`.

```
fee_heads
  id, name, code UNIQUE, recurrence CHECK IN
    ('MONTHLY','QUARTERLY','TERM','ANNUAL','ONE_TIME','ON_DEMAND'),
  is_taxable BOOLEAN DEFAULT false,
  is_refundable BOOLEAN DEFAULT false,
  proration_policy CHECK IN ('NONE','MONTHLY'),
  gl_account_code TEXT NULL,
  display_order INT, is_active, timestamps, deleted_at

fee_structures
  id, academic_year_id, class_id, section_id NULL,
  name TEXT NOT NULL,          -- "Grade 5 — Day scholar"
  is_active, created_by, timestamps, deleted_at
  UNIQUE(academic_year_id, class_id, section_id, name)  -- NOT (class, year)

fee_structure_items
  id, fee_structure_id ON DELETE CASCADE, fee_head_id,
  amount NUMERIC(12,2), recurrence_override NULL,
  effective_from DATE, effective_to DATE NULL, created_at

-- Bill-header fields (R12): Phase 0 confirmed panNumber, registrationNumber,
-- address, phone, website, logoUrl, principalName, principalSignatureUrl,
-- schoolStampUrl already exist on public.tenants. Add ONLY the three missing,
-- as nullable columns: tagline, payment_instructions, qr_image_url.

discount_reasons
  id, name, code UNIQUE, gl_account_code NULL, is_active, timestamps, deleted_at

transport_routes
  id, name, code UNIQUE, monthly_amount NUMERIC(12,2), is_active, timestamps, deleted_at

tax_rates
  id, name, rate NUMERIC(5,3), applies_to CHECK IN ('ALL','TAXABLE_HEADS'),
  effective_from DATE, effective_to DATE NULL, created_by, created_at
  -- ships EMPTY (R6)

late_fee_rules
  id, scope CHECK IN ('GLOBAL','FEE_HEAD'), fee_head_id NULL,
  type CHECK IN ('FLAT','PER_DAY','PERCENT'), value NUMERIC(12,2),
  grace_days INT DEFAULT 0, cap_amount NUMERIC(12,2) NULL,
  is_enabled BOOLEAN DEFAULT false, effective_from, effective_to NULL, timestamps
```

**Endpoints** — all `ACCOUNTANT_AND_ABOVE`, delete is `OWNER_ONLY`, standard `{success, data, meta}` envelope, soft delete via `deletedAt`:

CRUD for `/finance/fee-heads`, `/finance/discount-reasons`, `/finance/transport-routes`, `/finance/late-fee-rules`, `/finance/tax-rates`.
`/finance/fee-structures` gains `POST`, `GET` (list, filterable by year/class), `GET /:id`, `PATCH /:id/items`, `DELETE /:id`.

**Sequence numbering (R13, refined by Phase 0).** Current finance keys are flat `invoice_seq`/`payment_seq` that never reset per year — the BS year is only a label on the formatted string (`INV-2083-000042`), and the counter is continuous. New documents adopt R13 keys `<doctype>:<tenantSlug>:<fiscalYearBs>`, but **reset-per-fiscal-year is a tenant setting defaulting to CONTINUOUS**, matching current behaviour and the reference Ullens bill (whose counter does not reset). When continuous, the `fiscalYearBs` segment is fixed at the tenant's inception year so the key is stable; when reset-per-year, it advances. Do not silently change numbering semantics for any tenant with existing invoices. Keep the existing atomic upsert (`INSERT ... ON CONFLICT DO UPDATE SET value = value + 1 RETURNING value`).

**Tests**

- Two structures for the same class and year with different names both persist. This is the constraint that was previously impossible — it needs an explicit test.
- Sequence generation is gapless under concurrent calls (parallel transactions, not sequential).
- A tenant set to CONTINUOUS numbering does not reset across a simulated fiscal-year boundary; a tenant set to RESET does.
- Overlapping `tax_rates` effective ranges are rejected.
- `late_fee_rules` with `type='PERCENT'` and `cap_amount` set validates.

**CHECKPOINT 2** — live HTTP create of two structures for one class, plus the `SELECT` read-back showing both rows.

---

## 6. Phase 3 — Assignment and concessions (BILL-2)

Migration `00XX_bill_assignment.sql`.

```
student_fee_structure_assignments
  id, student_id, fee_structure_id, academic_year_id,
  effective_from DATE, effective_to DATE NULL,
  assigned_by, timestamps, deleted_at
  -- partial unique: one active assignment per student per academic year

student_fee_overrides
  id, student_id, fee_head_id, academic_year_id,
  override_amount NUMERIC(12,2), reason TEXT,
  effective_from, effective_to NULL, created_by, timestamps, deleted_at

student_concessions
  id, student_id,
  fee_head_id NULL,                       -- NULL = applies to whole bill
  academic_year_id,
  type CHECK IN ('PERCENT','AMOUNT'), value NUMERIC(12,2),
  cap_amount NUMERIC(12,2) NULL,
  discount_reason_id NOT NULL,
  effective_from, effective_to NULL,
  notes TEXT, created_by, timestamps, deleted_at

student_transport_assignments
  id, student_id, transport_route_id,
  effective_from, effective_to NULL, assigned_by, timestamps, deleted_at
```

**Bulk assign** runs as a background job through the existing scheduler/outbox pattern, not a synchronous request. A 1,200-student school produces ~10k rows; on 1 vCPU this will time out as HTTP. Chunked `createMany` inside a transaction, with a job row exposing progress and a per-student failure list.

**Endpoints**

- `POST /finance/students/:studentId/fee-structure` — assign
- `POST /finance/fee-structures/:id/bulk-assign` — accepts a class or explicit student list, returns a job id
- `GET /finance/jobs/:id` — job status and progress
- CRUD for overrides, concessions, transport assignments
- `GET /finance/reports/concession-register` — student, head, type, value, reason, who applied it, when. Answers the scholarship-obligation question.
- `GET /finance/students/:studentId/fee-preview` — resolves structure + overrides + concessions + transport into what the student would be charged for a given period, **without** creating anything. This is the read model Phase 4's draft billing run consumes.

**Tests**

- Concession resolution order: override replaces the structure amount; concession applies to the result; cap is respected.
- A percent concession with `fee_head_id IS NULL` applies across all heads.
- A concession whose effective range excludes the period does not apply.
- Cross-tenant probe on every new endpoint (`TenantMatchGuard`).
- IDOR probe: an accountant of tenant A cannot read tenant B's concessions.
- `fee-preview` returns identical output on repeat calls and creates no rows.

**CHECKPOINT 3** — live HTTP bulk-assign of a real class, job completion, and `SELECT COUNT(*)` read-back matching the class roster. Plus one `fee-preview` response for a student with an override and a capped percent concession, hand-verified against the expected arithmetic.

---

## 7. Phase 4 — Ledger core (BILL-3)

The load-bearing phase.

```
student_ledger_entries
  id, student_id, academic_year_id,
  entry_date DATE NOT NULL,               -- AD, stored
  entry_bs_year INT, entry_bs_month INT, entry_bs_day INT,
  entry_type CHECK IN
    ('OPENING_BALANCE','INVOICE','PAYMENT','REFUND','CREDIT_NOTE',
     'FINE','WRITE_OFF','ADJUSTMENT'),
  debit NUMERIC(12,2) NOT NULL DEFAULT 0,
  credit NUMERIC(12,2) NOT NULL DEFAULT 0,
  ref_doc_type TEXT NULL, ref_doc_id UUID NULL,
  narration TEXT,
  reverses_entry_id UUID NULL REFERENCES student_ledger_entries(id),
  created_by NOT NULL, created_at NOT NULL DEFAULT now()
  -- NO updated_at. NO deleted_at.
  CHECK (debit >= 0 AND credit >= 0)
  CHECK (NOT (debit > 0 AND credit > 0))
  CHECK (debit > 0 OR credit > 0)

student_account_balances
  student_id PRIMARY KEY, academic_year_id,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  last_entry_id UUID, updated_at
```

**Immutability trigger.** A `BEFORE UPDATE OR DELETE` trigger on `student_ledger_entries` that raises an exception unconditionally. R3 is enforced by Postgres, not by discipline. The trigger must have a test that attempts a direct `UPDATE` and asserts it fails.

**Balance semantics.** Truth is `SUM(debit) - SUM(credit)` computed in SQL. `student_account_balances` is a denormalized cache written **inside the same transaction** as the ledger insert, for list views only. A nightly reconciliation job recomputes every student's balance from the ledger and logs any drift as an incident. Positive balance = student owes. Negative = student holds advance credit.

**Concurrency.** Ledger inserts for a given student take a row-level advisory lock keyed on `student_id`. Two cashiers posting simultaneously must serialize.

**Opening balance import.** `POST /finance/ledger/opening-balances` accepts CSV or JSON, runs in dry-run mode first returning a per-row preview, and requires an explicit confirm call to commit. Follows the E.164 backfill precedent from REG-1. Each row becomes one `OPENING_BALANCE` entry — debit if owed, credit if the student carries advance.

**Endpoints**

- `POST /finance/ledger/opening-balances` (dry-run + confirm)
- `GET /finance/students/:studentId/ledger` — paginated statement, running balance, BS dates
- `GET /finance/students/:studentId/balance` — current balance and its sign
- `POST /finance/ledger/adjustments` — manual `ADJUSTMENT` entry, requires narration and a reason, `OWNER_ONLY`
- `POST /finance/ledger/entries/:id/reverse` — creates the mirror entry with `reverses_entry_id` set, `OWNER_ONLY`

**Invariants, each with a test**

1. Direct `UPDATE` on a ledger entry fails at the database level.
2. Direct `DELETE` on a ledger entry fails at the database level.
3. After any sequence of operations, `student_account_balances.balance` equals the SQL sum from the ledger.
4. Reversing an entry produces a mirrored entry and leaves the net balance unchanged from before the original entry.
5. An entry cannot carry both debit and credit.
6. Opening-balance dry-run creates zero rows.
7. Concurrent inserts for one student produce a correct final balance (test with parallel transactions, not sequential calls).
8. A parent can read only their own child's ledger; cross-family probe returns 403.

**CHECKPOINT 4** — the acceptance bar for this whole spec:

- Raw `tsc --noEmit` output and raw test count.
- Live HTTP: import an opening balance for a student, read the ledger, post an adjustment, reverse it, read the ledger again.
- Raw `SELECT` output for that student's ledger rows showing the reversal pair.
- Raw `SELECT` proving `student_account_balances` matches the ledger sum.
- Raw output of the attempted `UPDATE` showing the trigger's exception.

---

## 8. Proof standards

Unchanged from prior sessions and non-negotiable:

- Every phase proven with live HTTP calls plus PostgreSQL `SELECT` read-backs. Mocked unit tests are never accepted as proof for anything touching money or the ledger.
- Session end requires raw terminal output: `tsc --noEmit` and the test count. Summarized "clean" is not accepted.
- All work on `feat/bill-ledger-core`. Branch + PR, CI all-green. Claude Code never merges.
- Claude Code stops at every checkpoint and waits.
- Any deviation from this spec is logged in `BILL-BUGS.md` and raised, never decided unilaterally.
- Cross-tenant and IDOR probes are acceptance criteria on every new endpoint, not optional extras.

---

## 9. Deferred — logged, not in scope

| ID | Item |
|---|---|
| BILL-4+ | Billing periods, draft/preview/post runs, proration, invoice generation |
| BILL-5 | Payments rewrite, `payment_allocations`, advance auto-apply, cheque lifecycle, ConnectIPS + Fonepay |
| BILL-6 | Credit notes, refunds, write-offs, approval thresholds |
| BILL-7 | Late fee scheduler (rules table already built in Phase 2) |
| BILL-8 | Bill and receipt printing — A4, A5, 80mm thermal; PAN box, QR, payment instructions, dual AD/BS dates, signature line |
| BILL-9 | Reports: daybook, aging (extends REP-1), ledger statement, defaulters, cashier close |
| BILL-10 | Gateway reconciliation, period close |
| BILL-COMP-1 | Regulatory compliance: 10% scholarship obligation report; soft warnings when a fee head breaches municipal caps (admission ≤ 1 month tuition, annual ≤ 2 months, exam ≤ half month, materials ≤ 10% once yearly) |
| CASHIER-1 | Add `CASHIER` role below `ACCOUNTANT`, adjust finance guards |
| PAY-1 / PAY-2 | Sandbox proofs — **verify against the new `payments` table after BILL-5**, not the current one, or the work is wasted |
| ACC-1+ | Chart of accounts, journal entries, trial balance, P&L, balance sheet. `gl_account_code` fields on `fee_heads`, `discount_reasons` and payment methods exist from Phase 2 to make this a mapping exercise rather than a retrofit. |
