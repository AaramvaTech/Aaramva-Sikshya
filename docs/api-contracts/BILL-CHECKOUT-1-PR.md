# BILL-CHECKOUT-1 — charge the invoice's own balance, not the statement figure

Branch `feat/bill-checkout-1` → `main`. 6 commits, 26 files, +2257/−99. **No migration.**

---

## What was wrong

Checkout charged `total_receivable` — an invoice's own charge **plus every earlier unpaid
month** — while those earlier invoices stayed separately payable. The same arrears could be
collected twice.

**This is not theoretical.** `tenant_demo`, student Aarav Shrestha, 2026-08-12: two eSewa
payments cleared on the same day, both server-computed and gateway-`VERIFIED`.

```
RCPT-2083-000019  ESEWA  4260.00 → BINV-2083-000004  (own charge 2260, carry 2000)
RCPT-2083-000020  ESEWA  2000.00 → BINV-2083-000002  (own charge 2000)
```

Charged 4,260. Collected 6,260. **His ledger holds −2,000.00 today.** Paying invoice #4
settled *that row only*; invoice #2 — whose 2,000 was the carry folded into the 4,260 — kept
its live Pay button and was paid again.

PAY-1's "amount is server-computed, never client-supplied" invariant worked exactly as
designed and computed the wrong number.

Full analysis: `BILLING-CALC-AUDIT-1-phase0.md` (D32, D15), rulings in
`BILLING-CALC-AUDIT-1-rulings.md`.

## What changed

**Server — one rule, four call sites.** New `bill-own-balance.util.ts`:

- `OWN_BALANCE_SELECT` — `bi.net_amount - COALESCE(SUM(bpa.amount), 0)`
- `CLEARED_ALLOCATIONS_JOIN` — lifted verbatim so the B5-5 CLEARED filter cannot drift
- `clampOwnBalance(raw, invoiceRef, logger)` — floors at zero **and** WARNs naming the invoice

eSewa and Khalti, initiate **and** claim-path race guard, all four repointed. Compiled `dist`
carries **0** `total_receivable` in either service. Four SQL strings would have drifted; this
follows the `bill-class-guard.util.ts` precedent.

**Mobile.** Card heading is the BS period (an invoice is a month's bill, not a fee); secondary
line names what the bill covers plus the invoice number; amount and Pay button are the own
charge / own balance. Account tile reads `GET /finance/students/:id/balance` instead of summing
cards, citing `apps/web/lib/invoice-totals.ts`'s docblock at the site — the same fix applied to
the parent dashboard tile, which carried the identical sum. New statement screen: under
own-charge a fine appears on no card, and cards are the only surface with a Pay button.

**Minimal payload addition** (Phase 3): the list endpoint now returns `itemNames` — names only,
via one correlated `ARRAY_AGG`, no N+1 and no join fan-out against the existing `SUM`. Full item
rows stay on the single-invoice endpoint.

## Live verification

Against `tenant_demo` on a clean build. Actual figures returned, not expected ones:

| invoice | net | carry | **asked** | pre-fix |
|---|---|---|---|---|
| BINV-2083-000005 | 2260 | 1000 | **2260** | 3260 |
| BINV-2083-000001 | 3000 | 5500 | **3000** | 8500 |
| BINV-2083-000022 | 8500 | 12000 | **3500** | 20500 |
| BINV-2083-000020 | 8500 | 3500 | **8500** | 12000 |

000022 proves the allocation subtraction, not just the column swap: 8500 − 5000 already cleared.

**Control — no-carry invoices must not move.** 000006/000017/000026/000018 → identical under both
formulas, including the partially-paid one.

**Clamp + WARN** fired live exactly twice, on exactly the two cap-breaching invoices probed
(`BINV-2083-000004` −2000.00, `BINV-2083-000021` −500.00), and **not** on an invoice whose own
balance is legitimately 0.

**Claim guards:** the compiled `OWN_BALANCE_SELECT` executed directly against demo returns the
same figure initiate returned, six for six. Both guards share one constant with initiate.

**Account tile**, Binod Gurung — the whole ticket in one student:

| | |
|---|---|
| old tile (sum of card balances) | 3,260 — overstates by 960 |
| sum of own balances across cards | 2,260 |
| `/balance` (ledger) | **2,300** |

The 40 gap is a late fee; the statement drill-down renders it and closes at 2,300.

**Cleanup:** 8 probe `payment_transactions` rows (all `INITIATED`, no money) deleted with
read-back; both password shims restored byte-exact and 401-proven dead; probe server stopped;
`:3001` never touched.

## Limits of this evidence — read before approving

**(a) Khalti is not live-probed.** `KHALTI_SECRET_KEY` is present but **empty (length 0)** — the
documented PAY-2 state ("live proofs PENDING sandbox merchant key"). It has never had a key on
this machine. Khalti is covered by **shared-constant reasoning and compiled-`dist` inspection
only** (2× `OWN_BALANCE_SELECT`, 2× `clampOwnBalance`, 0× `total_receivable`), plus unit tests —
**not by a live HTTP probe.**

**(b) Rendered screens are unverified.** No emulator in this environment. Card fields are proven
by driving the exact `fees.tsx` expressions off real API payloads, and by unit tests on the
mapper — not by a screenshot or a click-through. Same disclosure as WEB-P Phase 5 / BILL-8-UI.

**(c) This closes the parent-facing half only.** The allocation-cap census found breaches from
`AUTO_FIFO` and `MANUAL`, and from `CASH` as well as `ESEWA` — **a cashier taking cash at the
counter triggers the same over-booking.** `fetchUnpaidInvoicesOldestFirst` still reports a
candidate's capacity as `total_receivable − allocations`. **The allocation cap
(BILLING-CALC-AUDIT-1 Ruling 3) is the actual fix**; 8 of 32 allocations on the dev DB (25%,
3,033.23 excess) already breach it. Do not read this PR as closing the defect.

The other five `total_receivable` consumers (invoice list `balance`, payment FIFO/MANUAL/status,
aging, credit-note cap, fine base) stay in the D15 ticket.

## Also in this branch

- `docs/ops/BILLING-CHECKOUT-PROD-CHECK.md` — two read-only queries answering "has production
  overcharged anyone?", written for someone at a terminal with no context. **Production remains
  unchecked**; a gate entry points at it from `RUNBOOK.md`.
- `BILL-7-OPEN-fine-has-no-document-line.md` — a late fee produces no document line, so it is
  visible in the tile and payable nowhere. Binod Gurung is the worked example.
- The two audit-discovery docs (Phase 0 / 0b), inherited from `audit/billing-calc-audit-1` —
  this branch was cut from it, so the PR bundles the rationale with the fix.
- `CLAUDE.md`: verify a running process by **uptime vs build time, never `dist`'s mtime** — a
  stale process behind a fresh `dist` has cost time four times, twice with `dist` itself current
  because orphaned watchers were recompiling it.

## Gate

| | before | after |
|---|---|---|
| api tests | 1355 | **1372** (143 suites) |
| mobile tests | 144 | **154** (15 suites) |
| web tests | 629 | **629** (untouched — confirms the DTO widening is additive) |

`tsc` clean on api / mobile / web. `nest build` exit 0. Rebased on `main` (`c069751`), linear,
no conflicts.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
