# BILL-6-SPEC — Corrections (credit notes, refunds, write-offs)

**Target path in repo:** `docs/api-contracts/BILL-6-SPEC.md`
**Branch:** `feat/bill-6-corrections`
**Depends on:** BILL-0–5, BILL-8, BILL-9 (all merged). Reuses the ledger (`student_ledger_entries` already permits `CREDIT_NOTE`/`REFUND`/`WRITE_OFF` types and the `reverses_entry_id` machinery), `bill_invoices`, `bill_payments`, `student_account_balances`, and the advisory-lock + same-transaction balance-cache posting path.
**Covers:** issuing credit notes against invoices, refunding available credit, writing off uncollectable debt — all behind a request→approve workflow, all posting to the existing ledger.
**Out of scope:** gateway (eSewa/Khalti) refunds — refunds are cash/bank only in v1; free-standing goodwill credits (later); period close (BILL-10).

---

## 0. What this phase does and does not do

**Does:** correct money that was billed wrong or is owed back. Three operations — **credit note** (cancel/reduce a wrong charge against an invoice), **refund** (release available advance credit back to the payer as cash/bank), **write-off** (declare an uncollectable debt lost) — each requested by an accountant and, above a threshold or always (refund/write-off), approved by an owner, then posted as exactly one offsetting ledger entry.

**Does not:** edit or delete any original invoice, payment, or ledger entry — corrections are new offsetting entries (ledger immutability, R3). Does not push money back through a payment gateway (cash/bank refund only). Does not let a refund create balance from nothing — it only releases credit the student actually holds.

---

## 1. Locked rulings

| # | Ruling |
|---|---|
| Inherited | All prior rulings hold: ledger append-only, `Money`/SQL aggregation, advisory-lock posting, gateway rail untouched, BS dates, never self-schedule, squash-merge, servers stopped by top-level PID, live-proof-not-mocks for anything touching money. |
| B6-1 | **Three operations in scope:** credit note, refund, write-off. All share the request→approve workflow and post to the existing ledger. |
| B6-2 | **Credit notes target a specific invoice** (optionally a specific invoice line, e.g. only the transport item), never free-standing. Traceable to the charge being corrected. |
| B6-3 | **Two-tier approval.** Credit notes below a tenant-configurable threshold (default ₹5,000) may be posted by an accountant alone; at or above it, a second approver is required. **Refunds and write-offs always require approval, regardless of amount.** |
| B6-4 | **Approver is `OWNER_ONLY`** (school owner / principal-tier). An accountant *requests*; an owner *approves*. |
| B6-5 | **Refund methods: CASH and BANK_TRANSFER only** in v1. Gateway refunds are out of scope (schools refund by cash/bank). |
| B6-6 | **A refund draws only from available advance credit / overpayment.** It releases money the student actually holds on account; it can never drive a balance negative from nothing. If available credit < requested refund, the request is rejected at validation. |
| B6-7 | **Corrections are offsetting entries, never edits.** A credit note posts `CREDIT_NOTE`, a refund `REFUND`, a write-off `WRITE_OFF` — each a new entry. The original invoice/payment/entry is never mutated. Each correction is itself **reversible** (a wrongly-issued correction is reversed via `reverses_entry_id`, never deleted). |
| B6-8 | **Real pending state.** A correction is `REQUESTED → APPROVED/REJECTED`. **Money posts to the ledger only on approval** — a pending correction does not change the balance (same principle as a pending cheque, B5-5). A rejected correction never posts. |
| B6-9 | **Full audit on every correction:** requested_by, approved_by (or rejected_by), a reason (FK to `discount_reasons` or a new `correction_reasons` lookup where a fee-discount reason doesn't fit — discovery decides), the target (invoice / payment / balance), timestamps, and the resulting ledger_entry_id. Non-negotiable for money-out. |
| B6-10 | **Ledger-effect direction, stated explicitly:** a credit note is a **credit** (reduces what the student owes). A write-off is a **credit** (reduces the owed balance to zero, offset to a bad-debt account). A refund is a **debit against the student's credit balance** (consumes their advance and records cash leaving) — it reduces the student's *credit*, it does not increase what they owe. This must be exactly right or balances invert. |

---

## 2. Tables

The ledger already supports the entry types. This phase adds the correction records that drive them and hold the approval workflow.

```
bill_corrections
  id, correction_number TEXT UNIQUE,          -- gapless, R13 sequence, doctype 'correction'
  type CHECK IN ('CREDIT_NOTE','REFUND','WRITE_OFF'),
  student_id, academic_year_id,
  target_invoice_id UUID NULL,                -- credit note (and write-off of an invoice)
  target_invoice_item_id UUID NULL,           -- optional line-level credit note
  amount NUMERIC(12,2) NOT NULL,
  reason_id UUID NOT NULL,                     -- FK to reason lookup (discovery: reuse discount_reasons or new correction_reasons)
  refund_method CHECK IN ('CASH','BANK_TRANSFER') NULL,   -- refund only
  refund_reference TEXT NULL,                  -- bank ref / voucher no, refund only
  status CHECK IN ('REQUESTED','APPROVED','REJECTED') DEFAULT 'REQUESTED',
  requested_by NOT NULL, requested_at NOT NULL DEFAULT now(),
  decided_by NULL, decided_at NULL, decision_note TEXT NULL,
  ledger_entry_id UUID NULL,                   -- set on approval; NULL while REQUESTED/REJECTED
  requires_approval BOOLEAN NOT NULL,          -- computed at request time from type + threshold
  timestamps, deleted_at
```

No new ledger table — corrections post into `student_ledger_entries` using the existing types. The correction row is the workflow + audit wrapper; the ledger entry is the money effect.

Threshold config: a tenant setting `credit_note_approval_threshold NUMERIC(12,2) DEFAULT 5000` (discovery confirms where tenant finance settings live and adds it there).

---

## 3. The workflow

**Request** — an accountant creates a `bill_corrections` row (`REQUESTED`). `requires_approval` is computed now: true for all refunds and write-offs; for credit notes, true iff `amount >= threshold`. Validation at request time:
- Credit note: target invoice exists, belongs to the student, amount ≤ the invoice's (or line's) outstanding-after-existing-credits. Cannot over-credit an invoice.
- Refund (B6-6): amount ≤ the student's available advance credit (SQL-checked against the ledger). Rejected if insufficient.
- Write-off: target invoice/balance exists and is outstanding.

**Auto-post path** — a credit note *below* threshold has `requires_approval=false` and posts immediately on request (still creates the correction row for audit, but goes straight to `APPROVED` with `decided_by = requester` and the ledger entry in the same transaction).

**Approve** — `OWNER_ONLY`. On approval, in one transaction under the student's advisory lock: post exactly one ledger entry of the correct type and direction (B6-10), set the correction `APPROVED`, link `ledger_entry_id`, update the balance cache. A refund additionally records the cash/bank method + reference.

**Reject** — `OWNER_ONLY`. Sets `REJECTED`, records `decided_by`/note, posts nothing. Balance unchanged.

**Reverse a correction** — if a correction was itself a mistake, an owner reverses it: a new mirror ledger entry via `reverses_entry_id`, leaving both the original correction entry and its reversal visible. Never a delete.

---

## 4. The invariant that matters most (B6-10)

Direction must be exactly right, or balances invert. Stated for the tests:

- **Credit note** on a student owing 5,000, note amount 1,200 → one `CREDIT_NOTE` credit entry of 1,200 → balance 3,800. Not 6,200.
- **Write-off** of a 5,000 owed balance → one `WRITE_OFF` credit entry of 5,000 → balance 0. The debt is gone from the student's ledger, recorded as written off (bad-debt offset).
- **Refund** for a student holding 2,000 *advance credit* (balance −2,000), refund 2,000 cash → one `REFUND` debit entry of 2,000 → balance 0. The advance is consumed and cash recorded as leaving. The student is not now owing 2,000; they're square. A refund can never make balance move the wrong way, and never runs when there's no credit to release.

Each gets a dedicated live test with a raw `SELECT` balance read-back before and after.

---

## 5. Endpoints

All correction *requests* are `ACCOUNTANT_AND_ABOVE`; all *approvals/rejections/reversals* are `OWNER_ONLY`.

- `POST /finance/corrections/credit-notes` — request a credit note (auto-posts if below threshold).
- `POST /finance/corrections/refunds` — request a refund (always pending approval).
- `POST /finance/corrections/write-offs` — request a write-off (always pending approval).
- `GET /finance/corrections` — list, filterable by type/status/student. PARENT object-scoped to own child (read own corrections only).
- `GET /finance/corrections/:id` — detail with audit trail.
- `POST /finance/corrections/:id/approve` — `OWNER_ONLY`; posts the ledger entry.
- `POST /finance/corrections/:id/reject` — `OWNER_ONLY`.
- `POST /finance/corrections/:id/reverse` — `OWNER_ONLY`; reverses an already-approved correction.

---

## 6. Tests (each proven live against real Postgres, not mocked)

1. **Credit-note direction (B6-10):** owe 5,000, credit 1,200 → balance 3,800, one CREDIT_NOTE credit entry. Raw balance read-back.
2. **Write-off direction:** owe 5,000, write off 5,000 → balance 0, one WRITE_OFF credit entry.
3. **Refund direction (B6-10):** hold 2,000 advance, refund 2,000 → balance 0, one REFUND debit entry consuming the credit; method + reference recorded.
4. **Refund guard (B6-6):** refund requested against a student with insufficient/zero advance credit → rejected at validation, nothing posts.
5. **Over-credit guard (B6-2):** credit note exceeding the invoice's outstanding-after-existing-credits → rejected.
6. **Threshold (B6-3):** a below-threshold credit note auto-posts (APPROVED, requester = decider); an at/above-threshold one stays REQUESTED until an owner approves; an accountant cannot approve (403).
7. **Pending posts nothing (B6-8):** a REQUESTED refund/write-off leaves the balance unchanged; balance moves only on approval; a REJECTED one never moves it.
8. **Reversal (B6-7):** approve a credit note, then reverse it → mirror entry, balance returns to pre-correction exactly, both entries visible, original never deleted.
9. **Correction-number gaplessness** under concurrent requests.
10. **Cross-tenant probe** on every endpoint; **IDOR** — a parent reads only their own child's corrections; an accountant cannot approve; approval is OWNER_ONLY.
11. **Immutability holds:** attempting to edit/delete a posted correction's ledger entry still fails at the DB trigger (unchanged from BILL-3, re-confirmed).

---

## 7. Checkpoints (phase-gated, stop at each)

**CHECKPOINT A — credit notes + approval workflow.** The `bill_corrections` table, the threshold config, credit-note request (auto-post below threshold, pending above), approve/reject, reverse. Live proof: the credit-note direction invariant (owe 5,000, credit 1,200 → 3,800), the threshold behaviour (auto vs pending, accountant can't approve), pending-posts-nothing, reversal returns to exact prior balance, over-credit guard. Raw build + test count. No refunds/write-offs yet.

**CHECKPOINT B — refunds + write-offs.** Both reuse the workflow from A. Live proof: refund direction (consume advance, balance to 0, method recorded), refund guard (no credit → rejected), write-off direction (owed → 0), always-requires-approval for both, cross-tenant + IDOR. Raw build + test count.

Standard proof rules throughout: live HTTP + raw `SELECT` read-backs, raw terminal output per checkpoint, branch + PR, CI green, Claude Code never merges, deviations logged and raised, never self-schedule, servers stopped cleanly.

---

## 8. What remains after BILL-6

- **BILL-7** — late-fee scheduler (rules table exists from BILL-1). The last build phase.
- **BILL-10** — gateway reconciliation, period close.
- **BILL-COMP-1** — 10% scholarship-obligation report, municipal fee-cap warnings.
- **Pre-live gates** (runbook): PAY-UI-REPOINT, non-superuser Postgres role, PAY-2-SANDBOX (Khalti), plus soft follow-ons (FIX-STORAGE-URL, FIX-DUE-DAYS, FIX-QUERY-DTO, NEPALI-COPY-REVIEW, transport-concession footing, BILL-9-EXPORT).
- **ACC-1+** — the full accounting module; `gl_account_code` fields already seeded to make it a mapping exercise. Corrections' bad-debt (write-off) and refund entries will map cleanly here.
