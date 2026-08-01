# BILL-9-SPEC — Reporting suite

**Target path in repo:** `docs/api-contracts/BILL-9-SPEC.md`
**Branch:** `feat/bill-9-reports`
**Depends on:** BILL-0–5 + BILL-8 (all merged). Reads the ledger, `bill_invoices`, `bill_payments`, `bill_payment_allocations`, `student_account_balances`, and extends REP-1's aging report.
**Covers:** six reports — daybook, defaulters, aging (extends REP-1), collection summary, student ledger statement, and cashier daily-close.
**Out of scope:** gateway reconciliation & period close (BILL-10), regulatory/compliance reports (BILL-COMP-1), chart-of-accounts/GL reporting (ACC-1+).

---

## 0. What this phase does and does not do

**Does:** read the money data already in the system and present it as the reports a school runs on — what moved today (daybook), who owes (defaulters), how old the debt is (aging), where collection came from (collection summary), one student's full account (statement), and the cashier's shift reconciliation (daily-close). Almost entirely read-only; the one exception is cashier-close, which records a shift record.

**Does not:** print/export to PDF or Excel in the core scope (JSON data endpoints first; a printable-export checkpoint follows only if wanted). Does not report on the old `invoices`/`payments` rail — new-system data only (B9-7). Does not touch balances, the ledger, or any money logic — it reads, never writes (except the cashier-close shift record).

---

## 1. Locked rulings

| # | Ruling |
|---|---|
| Inherited | All prior rulings hold: `Money` for any display formatting, **all aggregation SQL-side in `NUMERIC`** (never JS summing), BS-aware dates, snapshot discipline, gateway rail untouched, never self-schedule, squash-merge, servers stopped cleanly. |
| B9-1 | **Six reports in scope:** daybook, defaulters, aging (extends REP-1), collection summary, student ledger statement, cashier daily-close. |
| B9-2 | **JSON data endpoints first.** PDF/Excel export is a separate final checkpoint, built only if requested — the core deliverable is correct numbers, not presentation. No BILL-8-style visual loop in the core. |
| B9-3 | **Cashier daily-close is a real feature**, built as its own checkpoint (it has genuine logic: opening float, collected-by-method, expected-vs-counted, variance). Everything else is read-only. |
| B9-4 | **Access:** operational reports (daybook, collection summary, cashier-close) `ACCOUNTANT_AND_ABOVE`; defaulters + aging use the REP-1 finance-report roles (Principal-tier + Accountant); a **PARENT sees only their own child's ledger statement** (object-scoped, IDOR-proof). No other cross-student parent access. |
| B9-5 | **All reports are BS-date-driven**: accept a BS range, display BS dates, AD stored underneath. Daybook and cashier-close default to "today" (Asia/Kathmandu); summaries take an explicit range. |
| B9-6 | **All money aggregation is SQL-side `NUMERIC`.** Reports are the classic place float-summing sneaks back in — every total is a SQL `SUM`/`SUM(...) OVER`, cross-checked against a raw `SELECT` in proof. No `reduce((a,b)=>a+b)` over money in JS anywhere in this phase. |
| B9-7 | **New-system data only.** Reports read `bill_invoices`/`bill_payments`/ledger, never the old rail. Old-rail rows are pre-BILL-4 test junk; including them would be meaningless. |
| B9-8 | **Reports never mutate.** Read-only except the cashier-close shift record. A report must be safe to run any number of times with zero side effects — proven by a before/after row-count check on a dry read. |
| B9-9 | **Balances come from the ledger truth**, not a re-derivation. Defaulters/aging/statement read `student_account_balances` (the same-transaction cache) and/or the SQL ledger sum, consistent with how balance is defined everywhere else — never a bespoke recomputation that could drift from the ledger. |

---

## 2. Tables

Only cashier-close needs storage. Everything else is pure read.

```
cashier_shifts
  id, cashier_user_id, academic_year_id,
  opened_at, opened_bs_year INT, opened_bs_month INT, opened_bs_day INT,
  opening_float NUMERIC(12,2) NOT NULL DEFAULT 0,
  closed_at NULL, closed_by NULL,
  counted_cash NUMERIC(12,2) NULL,      -- what the cashier physically counted
  expected_cash NUMERIC(12,2) NULL,     -- opening_float + cash collected this shift (SQL-derived at close)
  variance NUMERIC(12,2) NULL,          -- counted - expected; signed
  status CHECK IN ('OPEN','CLOSED') DEFAULT 'OPEN',
  notes TEXT, timestamps
  -- one OPEN shift per cashier at a time (partial unique on cashier_user_id WHERE status='OPEN')
```

`expected_cash`, the collected-by-method figures, and `variance` are **computed SQL-side** from `bill_payments` in the shift window at close time, not accumulated in JS. The shift record stores the snapshot; the truth is the payments.

No other tables. Daybook, defaulters, aging, collection summary, and statement are all `SELECT`-only against existing tables.

---

## 3. The reports

**Daybook** — for a BS day (default today): every `INVOICE` posted and every `PAYMENT`/`DEPOSIT`/`REFUND` in that day's window, with per-method payment totals and a net movement figure. Ordered by time. This is the "what happened today" ledger view.

**Defaulters** — students with `balance > 0`, read from `student_account_balances`, joined to student/class, sortable by balance / class / oldest-unpaid-invoice age. Filterable by class and a minimum-balance threshold.

**Aging** — outstanding balance bucketed by the age of the oldest unpaid invoice: 0-30 / 31-60 / 61-90 / 90+ days as of a given BS date. Extends REP-1's existing aging endpoint (reuse its shape and roles; add the new-table source). Per-class and school-wide rollups.

**Collection summary** — total collected over a BS range, grouped by method (CASH/CHEQUE/BANK_TRANSFER/ESEWA/KHALTI) and separately by fee head (via allocations → invoice items). The "where did the money come from" view. Cheques count only when `CLEARED` (a PENDING cheque is not collection — consistent with B5-5).

**Student ledger statement** — one student's full account: opening balance, every charge/payment/concession/reversal in order, running balance, current balance and advance-credit figure. BS dates. Parent-facing, object-scoped. Extends BILL-3's ledger endpoint into a proper statement (adds opening/closing framing and totals).

**Cashier daily-close** — see §4.

---

## 4. Cashier daily-close (B9-3) — the one with real logic

- **Open shift:** a cashier opens a shift with an `opening_float` (the cash drawer's starting amount). One OPEN shift per cashier at a time.
- **During:** payments the cashier records are attributable to their open shift (by `received_by` + timestamp within the shift window).
- **Close shift:** the cashier enters `counted_cash` (what's physically in the drawer). The system computes, **SQL-side**, `expected_cash = opening_float + SUM(cash payments in the shift window)`, and `variance = counted_cash − expected_cash`. The close returns a summary: opening float, collected by each method, expected cash, counted cash, variance (over/short), and cheque/gateway totals (which don't affect the cash drawer but belong on the report).
- **Variance is reported, never auto-adjusted** — a short/over drawer is a fact the report surfaces for a human, not something the system silently corrects.

This makes the daybook trustworthy: it ties recorded collection to a physically reconciled drawer.

---

## 5. Endpoints

- `GET /finance/reports/daybook?bsDate=` — `ACCOUNTANT_AND_ABOVE`. Default today.
- `GET /finance/reports/defaulters?classId=&minBalance=&sort=` — REP-1 finance roles.
- `GET /finance/reports/aging?asOf=&classId=` — REP-1 finance roles (extends existing REP-1).
- `GET /finance/reports/collection?from=&to=&groupBy=method|feehead` — `ACCOUNTANT_AND_ABOVE`.
- `GET /finance/students/:studentId/statement?from=&to=` — `ACCOUNTANT_AND_ABOVE`; PARENT object-scoped to own child.
- `POST /finance/cashier/shifts/open` — open a shift with opening float. `ACCOUNTANT_AND_ABOVE`.
- `POST /finance/cashier/shifts/:id/close` — close with counted cash; returns the reconciliation. `ACCOUNTANT_AND_ABOVE`.
- `GET /finance/cashier/shifts?cashierId=&date=` — list/detail shift reconciliations.

All standard `{success, data, meta}` envelope.

---

## 6. Tests (each proven live against real data, not mocked)

Reports are uniquely prone to silent wrong-number bugs, so every total is cross-checked against an independent raw `SELECT`.

1. **Daybook** — post an invoice and record two payments (one cash, one eSewa) on a known BS day; daybook for that day shows exactly those movements, per-method totals match a raw `SUM`, and a different day shows none of them.
2. **Defaulters** — a student with a known balance appears with that exact figure; a fully-settled student does not appear; sort and min-balance filters behave.
3. **Aging** — an invoice aged into the 31-60 bucket lands in that bucket and not another; bucket sums equal the total outstanding (no double-count, no gap).
4. **Collection summary** — collected total over a range equals a raw `SUM` of cleared payments in that range; method breakdown sums to the total; a PENDING cheque is excluded, then included once CLEARED.
5. **Statement** — a student's statement running balance matches the ledger at every line; closing balance equals `student_account_balances`; opening + movements = closing exactly.
6. **Cashier-close** — open with a known float, record cash + cheque + eSewa payments, close with a deliberately-short counted amount; expected is SQL-derived, variance is correct and signed, cheque/gateway shown separately and not in the cash expectation.
7. **Read-only proof (B9-8)** — run every read report twice; a before/after `COUNT(*)` on all finance tables is unchanged (reports mutate nothing).
8. **SQL-aggregation proof (B9-6)** — confirm (by code inspection + a targeted test) no money total is summed in JS; all via SQL.
9. **Cross-tenant probe** on every endpoint; **IDOR** — a parent reads only their own child's statement (403 otherwise), and cannot reach any operational report.

---

## 7. Checkpoints (phase-gated, stop at each)

**CHECKPOINT A — read-only reports.** Daybook, defaulters, aging (REP-1 extension), collection summary, student statement. All SQL-aggregated, all cross-checked against raw `SELECT`s, read-only proven, cross-tenant + IDOR probed. Live proof for each with raw read-backs. Raw build + test count. No cashier-close yet.

**CHECKPOINT B — cashier daily-close.** The `cashier_shifts` table, open/close with SQL-derived expected cash and variance, the reconciliation summary. Live proof: open a shift, record mixed-method payments, close short, show correct variance and per-method breakdown, cheque/gateway excluded from cash expectation. Raw build + test count.

**CHECKPOINT C — printable export (only if requested).** PDF/Excel export of the reports, reusing the BILL-8 pdfkit path for any PDF output and the per-tenant header. If you decide JSON endpoints are enough for v1, this checkpoint is skipped and BILL-9 closes at B. Decide at the B gate.

Standard proof rules throughout: live HTTP + raw `SELECT` read-backs, raw terminal output per checkpoint, branch + PR, CI green, Claude Code never merges, deviations logged and raised, never self-schedule, servers stopped cleanly by top-level PID.

---

## 8. What remains after BILL-9

- **BILL-6** — credit notes, refunds, write-offs (corrections).
- **BILL-7** — late-fee scheduler (rules table exists from BILL-1).
- **BILL-10** — gateway reconciliation, period close.
- **BILL-COMP-1** — 10% scholarship-obligation report, municipal fee-cap warnings.
- **Pre-live gates** (runbook): PAY-UI-REPOINT, non-superuser Postgres role, PAY-2-SANDBOX (Khalti), plus soft follow-ons (FIX-STORAGE-URL, FIX-DUE-DAYS, FIX-QUERY-DTO, NEPALI-COPY-REVIEW, transport-concession footing).
- **ACC-1+** — the full accounting module (chart of accounts, journal, trial balance, P&L, balance sheet); `gl_account_code` fields already seeded on fee heads / discount reasons / payment methods to make it a mapping exercise.
