# BILL-5-SPEC — Payment engine

**Target path in repo:** `docs/api-contracts/BILL-5-SPEC.md`
**Branch:** `feat/bill-5-payments`
**Depends on:** BILL-0–4 (merged) + the cleanup pass (merged). Consumes the ledger, `bill_invoices`, `student_account_balances`, and the R13 sequence infrastructure.
**Covers:** recording payments against `bill_invoices`, allocation, advance deposits, cheque lifecycle, receipts, and — isolated as the final checkpoint — re-pointing eSewa/Khalti at the new invoices.
**Out of scope:** cash-refund-out and credit notes (BILL-6), late-fee application (BILL-7), receipt/bill *printing* (BILL-8), collection reports beyond a per-payment record (BILL-9).

---

## 0. What this phase does and does not do

**Does:** take money — cash, cheque, bank transfer, eSewa, Khalti — against `bill_invoices`, decide which invoices it settles (allocation), write exactly one `PAYMENT` (or `DEPOSIT`) entry to the ledger per payment, generate a gapless numbered receipt record, hold unallocated money as advance credit, and manage the pending→cleared→bounced life of a cheque. At the end, and only at the end, re-point the eSewa/Khalti rail at `bill_invoices` so a parent can finally pay a BILL-4 invoice online.

**Does not:** pay cash back out of the school (overpayment becomes advance credit; cash-out is BILL-6). Does not print receipts (BILL-8 — this phase generates the numbered record only). Does not touch late fees.

Until the final checkpoint, the old `payments` table and the eSewa/Khalti rail remain untouched (R10). The re-pointing is deliberately the last, most isolated piece of work in the phase.

---

## 1. Locked rulings (inherited + this phase)

| # | Ruling |
|---|---|
| R1–R15 | All prior rulings hold. Money via `Money`, ledger append-only, gateway rail frozen until the final checkpoint, BS-aware dates, gross/concession separate. |
| B5-1 | Payments live in a **new `bill_payments` / `bill_payment_allocations`** pair, additive alongside the old `payments`. Not a rewrite. |
| B5-2 | **Partial payments allowed.** A payment may settle less than an invoice's balance; the remainder stays owed. |
| B5-3 | **Allocation is auto-FIFO** (oldest unpaid invoice first) by default, with a **cashier override** to target specific invoices, behind a permission. |
| B5-4 | **Advance deposits allowed.** A payment with no target invoice becomes unallocated credit on the ledger and **auto-applies FIFO to the next invoice posted**. |
| B5-5 | **Cheque lifecycle: `PENDING → CLEARED / BOUNCED`.** A `PENDING` cheque records the payment but **does not reduce the ledger balance** until `CLEARED`. `BOUNCED` reverses cleanly (mirror ledger entry if any credit was posted). Cash / bank transfer / gateway payments are `CLEARED` immediately. |
| B5-6 | **Methods at launch:** `CASH`, `CHEQUE`, `BANK_TRANSFER`, `ESEWA`, `KHALTI`, via a lookup table so `CONNECTIPS` / `FONEPAY` slot in later without a migration. |
| B5-7 | **Overpayment becomes advance credit** on the ledger, never cash back. Cash-refund-out is BILL-6. |
| B5-8 | **Gapless receipt numbering** via the R13 sequence machinery (own doctype `receipt`), tenant reset policy honoured. A voided payment keeps its receipt number (never reused). |
| B5-9 | Every cleared payment/deposit writes **exactly one** ledger entry (`PAYMENT` for invoice-settling, `DEPOSIT` for pure advance) under the per-student advisory lock, in the same transaction as the `bill_payments` insert and its allocations. |
| B5-10 | **Gateway re-pointing is the final, isolated checkpoint.** eSewa/Khalti move from the old `invoices` to `bill_invoices`. This is the only point R10 is deliberately touched, and it is done alone, after the core engine is proven, with its own gate. |
| B5-11 | A **posted payment is immutable** in the ledger sense — a mistaken payment is reversed (BILL-6 territory for the money-out case), never edited. Cheque status transitions are the one allowed state change, and they append ledger entries rather than mutating the payment's ledger effect. |

---

## 2. Tables

Migration `00XX_bill_payments.sql` (canary demo → all tenants + scratch).

```
bill_payments
  id, receipt_number TEXT UNIQUE,      -- assigned at record time, gapless, never reused
  student_id, academic_year_id,
  amount NUMERIC(12,2) NOT NULL,
  method CHECK IN ('CASH','CHEQUE','BANK_TRANSFER','ESEWA','KHALTI'),  -- lookup-backed
  status CHECK IN ('CLEARED','PENDING','BOUNCED','VOIDED') DEFAULT 'CLEARED',
  received_date DATE, received_bs_year INT, received_bs_month INT, received_bs_day INT,
  reference TEXT NULL,                 -- cheque no / bank ref / gateway txn id
  cheque_bank TEXT NULL, cheque_date DATE NULL,   -- cheque-only metadata
  allocation_mode CHECK IN ('AUTO_FIFO','MANUAL','ADVANCE_ONLY'),
  ledger_entry_id UUID NULL,           -- the PAYMENT/DEPOSIT entry; NULL while PENDING
  gateway_txn_ref TEXT NULL,           -- links to payment_transactions when gateway-sourced
  notes TEXT, received_by, timestamps, deleted_at

bill_payment_allocations
  id, bill_payment_id ON DELETE CASCADE,
  bill_invoice_id,
  amount NUMERIC(12,2) NOT NULL,       -- how much of this payment settled this invoice
  created_at
  -- sum of a payment's allocations <= payment amount; the remainder is advance credit
```

**Advance credit is not a new table** — it is the unallocated remainder, i.e. a payment amount minus the sum of its allocations, reflected as a `DEPOSIT`/credit on the existing ledger. Balance stays `SUM(debit) - SUM(credit)` from the ledger, as always. `student_account_balances` continues as the same-transaction cache.

Invoice payment-status is **derived, not stored twice**: an invoice is `SETTLED` when its allocations sum to its `total_receivable`, `PARTIALLY_PAID` when between zero and that, `POSTED` when zero. The `bill_invoices.status` column updates in the same transaction for list-view speed, but the ledger + allocations are the truth.

---

## 3. The allocation model — the heart of the phase

A payment of amount `A` for a student:

- **AUTO_FIFO (default):** walk the student's unpaid `bill_invoices` oldest-first; allocate against each until `A` is exhausted or invoices run out. Any leftover is advance credit.
- **MANUAL (permissioned):** the cashier names invoice→amount pairs; validated so no invoice is over-allocated and the sum ≤ `A`; leftover is advance credit.
- **ADVANCE_ONLY:** no invoice targeted; the whole amount is advance credit (a `DEPOSIT` ledger entry).

**Advance auto-apply (B5-4):** when a new invoice is posted (BILL-4's post path), if the student holds advance credit, it is consumed FIFO against the new invoice in the same posting transaction. *This is a cross-phase touch:* BILL-4's post-runner gains a "consume available advance" step. It must preserve BILL-4's core invariant — posting still adds exactly one INVOICE entry for the charge; the advance consumption is a separate PAYMENT/allocation entry, not a modification of the invoice entry.

**The invariant that matters most:** the sum of a payment's allocations plus its advance-credit remainder always equals the payment amount, and the student's balance moves by exactly the cleared payment amount — never more, never less. A 5,000 payment against a student owing 8,500 leaves them owing 3,500, with one PAYMENT ledger entry of 5,000. Not 3,500-owed-with-a-13,500-swing, not two entries. This gets a dedicated live test, mirroring BILL-4's 8,500 invariant.

---

## 4. Cheque lifecycle (B5-5)

- **Record `PENDING`:** `bill_payments` row written, receipt number assigned, **no ledger entry, balance unchanged.** The invoice is not settled. A pending cheque is a promise, not money.
- **`CLEARED`:** appends the `PAYMENT`/`DEPOSIT` ledger entry and its allocations now, in one transaction under the advisory lock; balance drops; invoice status recomputes.
- **`BOUNCED` from PENDING:** no ledger entry existed, so just a status flip + audit stamp; nothing to reverse.
- **`BOUNCED` after CLEARED** (rare — cleared then reversed by bank): appends a reversing ledger entry so the balance returns; the original entry stays (append-only). Audit stamp records who and why.

Cash / bank transfer / eSewa / Khalti are born `CLEARED` and post their ledger entry immediately.

---

## 5. Endpoints

All `ACCOUNTANT_AND_ABOVE` unless noted; standard envelope; soft delete where applicable.

- `POST /finance/bill/payments` — record a payment (method, amount, allocation mode + optional targets, cheque metadata). Returns the payment with receipt number and resulting allocations.
- `GET /finance/bill/payments` — list, filterable by student/method/status/date. Parent object-scoped to own child.
- `GET /finance/bill/payments/:id` — full payment with allocations. Parent object-scoped.
- `PATCH /finance/bill/payments/:id/cheque-status` — `PENDING → CLEARED / BOUNCED`, permissioned; the only allowed state transition.
- `POST /finance/bill/payments/:id/void` — void a payment (reverses via appended ledger entry if one existed); receipt number retained. `OWNER_ONLY`.
- `GET /finance/students/:studentId/statement` — the student's combined invoice + payment ledger view with running balance and advance-credit figure. Parent object-scoped.
- `GET /finance/students/:studentId/advance-balance` — current unallocated credit.

Payer-facing (PARENT + staff, object-scoped) gateway routes are unchanged in shape until the final checkpoint.

---

## 6. Tests (each proven live, not mocked)

1. **Full payment** settles an invoice: one PAYMENT ledger entry, allocation = invoice total, invoice → SETTLED, balance drops exactly.
2. **Partial payment:** invoice → PARTIALLY_PAID, remainder still owed, one ledger entry of the paid amount.
3. **The 5,000-against-8,500-leaves-3,500 invariant** (§3) — the load-bearing test. Balance moves by exactly the payment; one entry; allocations + remainder = amount.
4. **AUTO_FIFO across three unpaid invoices:** oldest settled first, partial lands on the boundary invoice, correct leftover.
5. **MANUAL allocation:** cashier targets a newer invoice over an older one; over-allocation rejected; permission enforced.
6. **Advance deposit (ADVANCE_ONLY):** DEPOSIT entry, advance-balance rises, no invoice touched.
7. **Advance auto-apply on next invoice post** — advance consumed FIFO in the post transaction; BILL-4's one-INVOICE-entry invariant still holds alongside the separate advance-consumption entry.
8. **Overpayment** → excess becomes advance credit, not cash; balance goes to the correct negative (credit) figure.
9. **Cheque PENDING** posts no ledger entry and does not change balance; **CLEARED** then posts it; **BOUNCED-from-PENDING** leaves balance untouched; **BOUNCED-after-CLEARED** appends a clean reversal.
10. **Receipt gaplessness** under concurrent payments (parallel transactions); voided payment's number never reused.
11. **Two cashiers, one student, simultaneous** — advisory lock serialises; final balance correct, no lost update.
12. **Cross-tenant probe** on every endpoint; **IDOR** — a parent pays/reads only their own child (403 otherwise); MANUAL-allocation permission gate holds.

---

## 7. Checkpoints (phase-gated, stop at each)

**CHECKPOINT A — tables + record + allocate.** Migration canary-first. Recording a CLEARED cash payment with AUTO_FIFO and MANUAL allocation; advance deposit. Live proof: the 5,000→3,500 invariant with raw `SELECT`s (one ledger entry, allocations + remainder = amount, balance moved exactly), plus a FIFO-across-three-invoices proof. Raw build + test count.

**CHECKPOINT B — cheques + advance auto-apply + void.** Cheque PENDING/CLEARED/BOUNCED lifecycle; advance auto-applied on a fresh invoice post (proving BILL-4's invariant still holds); payment void with clean reversal. Live proof for each transition and the advance-consumption-on-post path. Raw build + test count.

**CHECKPOINT C — gateway re-pointing (ISOLATED, the delicate one).** Only now: move eSewa/Khalti from `invoices` to `bill_invoices`. This is the sole deliberate touch of the R10-frozen rail. Requirements:
- The old `payments` table and `payment_transactions` contract are preserved; the gateway services now credit `bill_invoices` via a `bill_payments` insert + ledger entry (reusing the CHECKPOINT A path), not the old `recordPaymentInTx`.
- A gateway payment produces exactly one `bill_payments` row + one ledger entry, idempotent on the gateway txn id (double-callback safe), same as the old rail's replay-safety.
- **PAY-1 / PAY-2 sandbox proofs happen here**, against the new table — the manual eSewa/Khalti sandbox click-through, evidence chain, and cleanup, verifying a real sandbox payment settles a real `bill_invoice`.
- Live proof: a sandbox eSewa payment and a sandbox Khalti payment each settling a `bill_invoice`, with the double-callback idempotency shown. Raw build + test count.

Standard proof rules (BILL-SPEC §8) throughout: live HTTP + raw `SELECT`, raw terminal output per checkpoint, branch + PR, CI green, Claude Code never merges, deviations logged and raised.

---

## 8. Cross-phase touch register (things outside `bill_payments` this phase changes)

Stated explicitly so nothing is a surprise:

1. **BILL-4 post-runner** gains an advance-consumption step (B5-4). Must preserve BILL-4's one-INVOICE-entry invariant — proven by re-running BILL-4's invariant test alongside the new advance test.
2. **`bill_invoices.status`** gains `PARTIALLY_PAID`/`SETTLED` transitions driven by allocations (the column already has these states from BILL-4; now they're actually written).
3. **eSewa/Khalti services** (CHECKPOINT C only) re-point to `bill_invoices`. The R10 freeze is lifted for exactly this, exactly here, and the old `payment_transactions` audit contract is preserved.

Everything else is contained to the new `bill_payments` tables.

---

## 9. What this unlocks next

- **BILL-6** — credit notes, cash-refund-out, write-offs against posted invoices and overpaid accounts.
- **BILL-7** — the late-fee scheduler (rules table already exists from BILL-1).
- **BILL-8** — printed receipts (thermal 80mm + A4) and printed bills, using the real Ullens layout; the receipt *record* already exists from this phase, printing renders it.
- **BILL-9** — collection reports, daybook, cashier close, defaulters, aging.
