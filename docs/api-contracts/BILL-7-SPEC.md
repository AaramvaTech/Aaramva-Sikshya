# BILL-7-SPEC — Late-fee engine

**Target path in repo:** `docs/api-contracts/BILL-7-SPEC.md`
**Branch:** `feat/bill-7-late-fees`
**Depends on:** BILL-0–6, BILL-8, BILL-9 (all merged). Reuses the `late_fee_rules` table (built in BILL-1: FLAT/PER_DAY/PERCENT, grace_days, cap_amount, is_enabled, effective dates), the ledger (`FINE` is already a valid entry type), `bill_invoices`, `student_account_balances`, the advisory-lock + same-transaction balance-cache posting path, and the existing `@Cron`/`@Interval` scheduler pattern (CredentialDeliveryPoller / ReconcileLedgerBalancesService), not BullMQ.
**Covers:** the scheduled + manually-triggerable job that accrues late fees on overdue invoices, idempotently, and a fines report.
**This is the last build phase of the billing module.**

---

## 0. What this phase does and does not do

**Does:** find invoices past (due date + grace) with an outstanding balance, compute the late fee owed per the applicable `late_fee_rules`, and post it to the ledger as a `FINE` entry — idempotently, so running the job any number of times produces exactly the fine that time-and-rules dictate, never a duplicate. Runs daily on a schedule and on manual trigger. Surfaces a fines report.

**Does not:** apply fines for any tenant that hasn't explicitly enabled them (off by default). Does not double-fine on re-run. Does not delete or rewrite past fines when a rule changes — past fines are real ledger history; only future accrual changes. Does not self-schedule via any agent primitive (the cron is NestJS `@Cron`, application infrastructure — unrelated to the never-self-schedule agent rule).

---

## 1. Locked rulings

| # | Ruling |
|---|---|
| Inherited | Ledger append-only, `Money`/SQL aggregation, advisory-lock posting, gateway rail untouched, BS dates, snapshot discipline, never self-schedule (agent), squash-merge, servers stopped by top-level PID, live-proof-not-mocks. |
| B7-1 | **Compute-total-post-delta.** Each run computes the *total* fine an invoice should have accrued by today (per days-overdue and rule), compares to fines already posted for that invoice, and posts only the **delta**. A 10-day-overdue PER_DAY invoice carries one running fine reflecting 10 days — never 10 entries, never re-adding day 1. |
| B7-2 | **Trigger condition:** invoice is past `due_date + grace_days` AND has outstanding balance > 0. A settled invoice accrues nothing, even if briefly late. |
| B7-3 | **Accrual stops** when the invoice is settled OR the rule's `cap_amount` is reached. PER_DAY fines never exceed the cap. |
| B7-4 | **Off by default per tenant.** A fine is applied only where a `late_fee_rules` row is `is_enabled = true` and effective for the date. No tenant gets surprise fines. |
| B7-5 | **Daily schedule**, early morning Asia/Kathmandu, via the existing `@Cron` pattern (not BullMQ). Plus a manual trigger endpoint. Both paths run the identical idempotent engine. |
| B7-6 | **Manual trigger** is `OWNER_ONLY` (or ACCOUNTANT_AND_ABOVE — discovery/ruling), for catch-up and testing. A manual run is exactly as idempotent as the scheduled one. |
| B7-7 | **A fine posts one `FINE` debit** (increases owed) under the student advisory lock, in the same transaction as the balance-cache update, keyed so it cannot double-post for the same (invoice, accrual-through-date). Shows on the ledger and the next bill's previous-balance. |
| B7-8 | **Fines snapshot the rule applied** (type, value, cap, the days-overdue basis) onto the fine record, like tax snapshots on invoices — a later rule edit never rewrites an already-posted fine. |
| B7-9 | **Reversible, not deletable.** A wrongly-applied fine is reversed via `reverses_entry_id` (owner action), never deleted. Disabling a rule stops **future** accrual; **past** posted fines remain as real ledger history. |
| B7-10 | **Idempotency is the load-bearing invariant.** Running the job twice in a row posts zero new entries the second time. Proven live by consecutive runs with a `COUNT(*)` read-back. |

---

## 2. Tables

The rules and the ledger entry type already exist. This phase adds a fine record (accrual tracking + snapshot + idempotency key) and a run log.

```
bill_fine_accruals
  id, bill_invoice_id, student_id, late_fee_rule_id,
  accrued_through DATE NOT NULL,              -- the date this accrual reflects
  days_overdue INT NOT NULL,
  total_fine NUMERIC(12,2) NOT NULL,          -- cumulative fine for this invoice as of accrued_through
  delta_posted NUMERIC(12,2) NOT NULL,        -- the increment this run posted
  rule_type_snapshot TEXT, rule_value_snapshot NUMERIC(12,2),
  rule_cap_snapshot NUMERIC(12,2) NULL,       -- B7-8
  ledger_entry_id UUID NOT NULL,              -- the FINE entry this created
  fine_run_id UUID, created_at
  UNIQUE (bill_invoice_id, accrued_through)   -- B7-7/B7-10: one accrual per invoice per through-date

bill_fine_runs
  id, triggered_by CHECK IN ('SCHEDULED','MANUAL'),
  triggered_by_user_id UUID NULL,             -- set for MANUAL
  run_date DATE, started_at, finished_at NULL,
  invoices_scanned INT, invoices_fined INT,
  total_fine_posted NUMERIC(12,2), status CHECK IN ('RUNNING','COMPLETED','FAILED'),
  created_at
```

The `UNIQUE (bill_invoice_id, accrued_through)` constraint is the hard idempotency backstop: a second run on the same day cannot insert a second accrual for the same invoice — it's a no-op by construction, not just by application logic.

---

## 3. The engine

For each enabled, effective rule's scope, find invoices matching B7-2 (past due+grace, outstanding > 0). For each:

1. Compute `days_overdue` as of today (BS-aware, Asia/Kathmandu).
2. Compute `total_fine` per the rule: FLAT (flat once past grace), PER_DAY (`value × days_overdue`), PERCENT (`value% × outstanding`), each clamped to `cap_amount` if set (B7-3).
3. Look up fines already posted for this invoice (sum of prior `bill_fine_accruals.delta_posted`).
4. `delta = total_fine − already_posted`. If `delta <= 0`, skip (already fully accrued, or capped). If `delta > 0`, in one transaction under the student advisory lock: insert the `bill_fine_accruals` row (the UNIQUE constraint enforces one-per-invoice-per-day), post one `FINE` debit of `delta` to the ledger, update the balance cache.

A run that fails partway leaves already-posted accruals intact (each invoice is its own transaction) and is safe to re-run — the delta logic + UNIQUE constraint make re-runs no-ops for already-processed invoices.

---

## 4. The idempotency invariant (B7-10) — the one that matters most

Late fees run unattended on a timer. The catastrophic failure is silent double-fining. Stated for the tests:

- An invoice 10 days overdue, PER_DAY rule ₹10/day → total fine ₹100. First run posts one FINE entry of ₹100. **Second run the same day posts nothing** — `delta = 100 − 100 = 0`, and the UNIQUE constraint would block a duplicate accrual anyway. Balance moved by exactly ₹100, once.
- Next day (11 days overdue) → total ₹110, prior ₹100, delta ₹10 → one new FINE entry of ₹10. Balance now reflects ₹110 total, across two entries, never re-adding the first 10 days.
- Capped rule (cap ₹80): at 10 days the total clamps to ₹80, not ₹100; further runs post nothing once ₹80 is reached.

Proven live by running the manual trigger twice consecutively and asserting the second run posts zero entries and moves the balance by zero.

---

## 5. Endpoints

- `POST /finance/late-fees/run` — manual trigger; runs the idempotent engine now, returns a `bill_fine_runs` summary. `OWNER_ONLY` (or ACCOUNTANT_AND_ABOVE — ruling at build).
- `GET /finance/late-fees/runs` — list run history with counts and totals.
- `GET /finance/reports/fines?from=&to=&classId=` — the fines report: which invoices accrued fines, how much, under which rule, over a BS range. REP-1 finance roles. (Checkpoint B.)
- `POST /finance/late-fees/accruals/:id/reverse` — reverse a wrongly-applied fine. `OWNER_ONLY`.

The scheduled `@Cron` runs the same engine as `POST /finance/late-fees/run`, per tenant, for tenants with late fees enabled.

---

## 6. Tests (each proven live against real Postgres, not mocked)

1. **PER_DAY accrual:** 10 days overdue, ₹10/day → one FINE entry ₹100, balance +100.
2. **Idempotency (B7-10):** run again same day → zero new entries, balance unchanged. Then simulate next day → delta ₹10 only, never re-adding day 1.
3. **Cap (B7-3):** capped rule stops at the cap; runs past the cap post nothing.
4. **Off by default (B7-4):** a tenant with no enabled rule accrues nothing; enabling one starts accrual from that point.
5. **Trigger condition (B7-2):** a settled invoice accrues nothing; an in-grace invoice accrues nothing until past grace.
6. **FLAT and PERCENT** rule types compute correctly.
7. **Snapshot (B7-8):** post a fine, edit the rule's value, re-run → the already-posted fine is unchanged; only new accrual uses the new value.
8. **Reversal (B7-9):** reverse a fine → mirror entry, balance back to prior, both visible, never deleted. Disable a rule → future runs stop accruing, past fines remain.
9. **UNIQUE backstop:** a forced duplicate accrual insert for the same (invoice, accrued_through) fails at the DB constraint.
10. **Scheduled = manual:** the cron path and the manual path post identical results for the same state.
11. **Cross-tenant + IDOR** on all endpoints; manual trigger and reversal are permission-gated; fines report parent-scoped appropriately.
12. **Ledger immutability** re-confirmed on FINE entries.

---

## 7. Checkpoints (phase-gated, stop at each)

**CHECKPOINT A — the accrual engine + idempotent manual run.** `bill_fine_accruals` + `bill_fine_runs` tables, the compute-total-post-delta engine, the manual trigger endpoint, reversal. Live proof: the idempotency invariant (run twice → second posts zero), PER_DAY accrual, the next-day delta, the cap, off-by-default, settled/in-grace accrue nothing, snapshot integrity, reversal. Raw build + test count. No cron yet.

**CHECKPOINT B — scheduled cron + fines report.** Wire the `@Cron` (daily, Asia/Kathmandu, per enabled tenant) running the identical engine; the fines report. Live proof: cron path posts identical results to manual for the same state; fines report matches raw `SELECT`s; cross-tenant + IDOR. Raw build + test count. This closes BILL-7 and the build.

Standard proof rules throughout: live HTTP + raw `SELECT` read-backs, raw terminal output per checkpoint, branch + PR, CI green, Claude Code never merges, deviations logged and raised, never self-schedule (agent), servers stopped by top-level PID.

---

## 8. After BILL-7 — the build is complete

With BILL-7 merged, the billing module's build is done: catalog, assignment, ledger, billing runs, payments (online + off), corrections, printing, reports, and late fees. What remains is **not building**:

- **Pre-live gates** (runbook, required before any real school cutover): PAY-UI-REPOINT (mobile Pay button → `bill_invoices`), non-superuser Postgres role, PAY-2-SANDBOX (Khalti), plus soft follow-ons (FIX-STORAGE-URL, FIX-DUE-DAYS, FIX-QUERY-DTO, NEPALI-COPY-REVIEW, transport-concession footing, BILL-9-EXPORT, FIX-CLAUDEMD-DRIFT verification).
- **Optional future:** BILL-10 (gateway reconciliation, period close), BILL-COMP-1 (scholarship-obligation report, fee-cap warnings), ACC-1+ (the accounting module — `gl_account_code` fields already seeded throughout to make it a mapping exercise).

The core fee-management platform is feature-complete once this merges.
