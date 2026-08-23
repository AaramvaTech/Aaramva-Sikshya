# BILLING-CALC-AUDIT-1 — Phase 0b: three pre-triage questions

Branch `audit/billing-calc-audit-1`. **Read-only.** No code changed, no fixes, no tests.
All database evidence is from the **local dev database** (`localhost:5432/aaramva_shikshya`,
role `aaramva_app`) via `SELECT` only. **Production was not reachable from this session and was
not inspected** — see §1.4.

---

## 1. D32 — what a parent is actually charged at checkout

### 1.1 The answer

**Yes. The figure presented to a parent at checkout is `total_receivable`, which carries
lifetime arrears, under a label naming a single month's fee heads. And yes — money has been
taken against it.**

### 1.2 The client chain, end to end

Checkout exists on **mobile only** (`apps/mobile/app/(parent)/fees.tsx`). The web parent portal
has no checkout — WEB-P Phase 5's hard exclusion still holds; no `apps/web` file references
`esewa/initiate`, `khalti/initiate`, or `payment-gateways`.

| Step | Code | Figure |
|---|---|---|
| Card heading | `invoiceTitle()` — `items[0].feeCategoryName`, or `"{first} +N more"` | a **fee-head name**, e.g. "Tuition Fee" |
| Card amount | `mapBillInvoiceToLegacy`: `totalAmount: inv.totalReceivable` | **`total_receivable`** |
| Pay button label | `PayChooser balanceLabel={formatNPR(inv.balance)}` → `t('pay.payWith', {amount, gateway})` | **"Pay NPR {balance} with eSewa"** |
| `inv.balance` | `bill-invoice.service.ts:47` — `total_receivable − COALESCE(SUM(cleared allocations),0)` | `total_receivable`-derived |
| Server charge | `esewa.service.ts:198` / `khalti.service.ts:159` — the **identical** formula, recomputed | same number |

The client is not lying about what will be charged — client and server agree. **Both are
`total_receivable`.** The label above it names one month's fee heads.

Two aggravating details:

- The screen's **"Outstanding" summary tile** is `invoices.reduce((a,i) => a + i.balance, 0)`
  (`billInvoiceMapping.ts:88-95`). Since each invoice's `total_receivable` already contains the
  prior months' unpaid amounts, this sums the same arrears once per month they have been
  outstanding — D33's double-count, shown to the parent rather than to an accountant.
- `mapBillInvoiceToLegacy` sets `fineAmount: 0` with the comment *"not fabricated"*. But BILL-7
  fines **are** debited to the ledger, so they reach the parent's bill on the *next* invoice
  inside the `previous_balance` component — arriving with no line, no label, and a displayed
  fine of zero.

### 1.3 Money has moved against it — a concrete instance

Dev DB, `tenant_demo`, student **Aarav Shrestha**. Four eSewa payments totalling NPR 9,260
exist across the tenant; one of them is the case:

```
receipt            method status  paid     invoice           net_amount prev_balance total_receivable
RCPT-2083-000019   ESEWA  CLEARED 4260.00  BINV-2083-000004  2260.00    2000.00      4260.00
RCPT-2083-000020   ESEWA  CLEARED 2000.00  BINV-2083-000002  2000.00       0.00      2000.00
```

Both on **2026-08-12**, in that order. `payment_transactions` confirms both amounts were
**server-computed and gateway-`VERIFIED`** — the PAY-1 invariant ("amount is server-computed,
never client-supplied") worked exactly as designed, and computed the wrong number.

The student's full ledger:

```
2026-07-26  INVOICE      DR 2000.00   Invoice BINV-2083-000002
2026-07-26  INVOICE      DR 2260.00   Invoice BINV-2083-000004
2026-08-01  CREDIT_NOTE  CR  100.00   COR-2083-000003
2026-08-01  CREDIT_NOTE  DR  100.00   (reversal)
2026-08-11  PAYMENT      CR 3000.00   RCPT-2083-000014
2026-08-11  PAYMENT      DR 3000.00   (reversal)
2026-08-12  PAYMENT      CR 4260.00   RCPT-2083-000019   ← eSewa
2026-08-12  PAYMENT      CR 2000.00   RCPT-2083-000020   ← eSewa
```

- **Charged:** 2,000 + 2,260 = **4,260**
- **Collected:** 4,260 + 2,000 = **6,260**
- **Ledger balance today: −2,000.00** — a 2,000 advance credit nobody meant to create.

The mechanism: paying `BINV-2083-000004` for 4,260 settled *that invoice's row*, because the
allocation is booked entirely against the invoice the payer clicked (D15). It never touched
`BINV-2083-000002`, whose own `total_receivable` of 2,000 was the very arrears folded into the
4,260. So the app went on displaying `BINV-2083-000002` with a live **"Pay NPR 2,000"** button,
and it was paid a second time.

Both invoices now read `SETTLED` with `ui_balance = 0.00`, so **nothing in the product surfaces
the overpayment.** Only the ledger's −2,000 records it.

### 1.4 What this instance is, and what I cannot tell you

The date (2026-08-12), the tenant (`demo`), and the round amounts match the PAY-1 sandbox proof
session recorded in memory as *"CLOSED 2026-08-12 (real on-device sandbox proof)"*. **This is
almost certainly your own sandbox testing, not a parent.** I cannot distinguish "operator
deliberately clicked both Pay buttons" from "the UI misled someone" — and it does not matter to
the finding: the server computed 4,260 for an invoice worth 2,260, the gateway cleared it, and
the second invoice stayed payable afterwards.

**Production was not inspected.** This session reached only `localhost`. Per memory, prod is
weeks behind `main`, which may mean the gateway-repointed rail is not live there at all. The
check to run against prod, read-only:

```sql
-- per tenant schema: has any gateway payment cleared against a carry-forward invoice?
SELECT bp.receipt_number, bp.method, bp.amount, bi.invoice_number,
       bi.net_amount, bi.previous_balance, bi.total_receivable
FROM bill_payments bp
JOIN bill_payment_allocations bpa ON bpa.bill_payment_id = bp.id
JOIN bill_invoices bi ON bi.id = bpa.bill_invoice_id
WHERE bp.method IN ('ESEWA','KHALTI') AND bp.status = 'CLEARED'
  AND bi.previous_balance <> 0;

-- and: which students are sitting on an unexplained advance?
SELECT student_id, SUM(debit) - SUM(credit) AS balance
FROM student_ledger_entries GROUP BY student_id HAVING SUM(debit) - SUM(credit) < 0;
```

### 1.5 Exposure elsewhere on the dev DB

| Tenant | Invoices | With `previous_balance ≠ 0` | Max carry | Gateway money cleared |
|---|---|---|---|---|
| `demo` | 19 | 10 (Σ 31,250) | 2,000 | **4 payments, NPR 9,260** |
| `motherland_school` | 66 | 45 (Σ 4,818.14) | 200.00 | none — 1 txn stuck `INITIATED` since 2026-07-14 |
| `test` | 36 | 0 | — | none |
| all others | 0 | — | — | none |

Motherland has the condition at scale (45 of 66 invoices) but no gateway money has moved; its
carries are small (max 200). Demo is the only tenant where the mechanism has executed.

---

## 2. D15 — the shape of `total_receivable`

### 2.1 Writers

**Exactly one.** `bill-run-post-runner.service.ts:176` + the INSERT at `:190-199`:

```ts
const totalReceivable = netAmount.add(previousBalance);
```

`netAmount` is frozen from `bill_run_lines`; `previousBalance` is the **lifetime** ledger sum
(`SUM(debit) − SUM(credit)` with no `academic_year_id` filter, `:150`).

There is **no `UPDATE` of `total_receivable` anywhere.** The field is write-once at post time and
immutable thereafter — `bill-document.service.ts:251` relies on that explicitly ("`total_receivable`
itself never changes after posting") for BILL-8's byte-identical reprint guarantee.

*Intent at the write site:* "the figure a payer actually owes, and the one the words must say"
(`:182`, from the BILL-8 amount-in-words fix). That is a **statement-of-account** semantic: what
this person owes us in total, as at this bill.

### 2.2 Consumers, and what each assumes

| # | Consumer | Reads it as | Correct under write-site intent? |
|---|---|---|---|
| 1 | `bill-invoice.service.ts:47,80` → `balance` | this invoice's outstanding | ✗ |
| 2 | `bill-payment.service.ts:298,318,345` — FIFO candidates, MANUAL cap, `recomputeInvoiceStatus` | this invoice's outstanding | ✗ |
| 3 | `esewa.service.ts:184,373` / `khalti.service.ts:159,361` — initiate + claim | this invoice's outstanding | ✗ — **this is D32** |
| 4 | `fee-aging-report.service.ts:46` | this invoice's outstanding | ✗ — double-counts arrears |
| 5 | `bill-correction.service.ts:477-486` `creditableAmount` | this invoice's creditable value | ✗ — cap includes arrears |
| 6 | `bill-fine.service.ts:194` `processInvoice` | fineable base | ✗ — PERCENT compounds |
| 7 | `collection-report.service.ts:83` — apportionment **denominator** | sum of this invoice's items | ✗ — weights don't sum to 1 |
| 8 | `bill-document.service.ts:241-257`, `bill-pdf.service.ts:275`, `print/invoice-half.ts:518` | "Total receivable" on the printed bill | **✓** |
| 9 | `mobile/lib/billInvoiceMapping.ts:62,66` → `subtotal`, `totalAmount` | "Total" on the fee card | ✓ as a figure, ✗ as a label |
| 10 | `web/app/(portal)/parent/fees/page.tsx:118` | "Total" per invoice | ✓ (comment states the intent) |

**Nine consumers, one intent, and eight of them read it as something it is not.** The one
consumer that reads it as written is the printed bill — which is why the print audit found
nothing here.

### 2.3 The semantic is already contested in-tree

Three places independently discovered this and worked around it **locally**, without changing
the column:

- `web/lib/invoice-totals.ts` — a dedicated helper whose whole docblock is a warning:
  *"`netAmount` … never `totalReceivable` … summing totalReceivable across a student's invoices
  double-counts every carried balance."* Its `sumInvoiceTotals` uses `netAmount`.
- `api/src/modules/dashboard/dashboard.service.ts:119` — *"net_amount (this invoice's own
  charge, not total_receivable, which would double-count each invoice's carried-forward
  previous_balance — see lib/invoice-totals.ts on the web side for the same rule)."*
- `web/app/(school)/students/[id]/page.tsx:153` — the same avoidance, same reason.

So the codebase already contains an explicit, written rule for aggregation
(*use `net_amount`*) that the money layer, the reports, and both gateways do not follow.

### 2.4 Does "this invoice's own outstanding" exist as a field?

**No — and it cannot be cleanly derived today.**

- `net_amount` is this invoice's own **charge**. It exists, it is correct, and it is what the
  three workarounds above already use.
- "Own outstanding" would be `net_amount − (payments attributable to this invoice)`. The second
  term does not exist: `bill_payment_allocations.amount` is booked against
  `bill_invoice_id`, but an allocation's amount is **not bounded by that invoice's
  `net_amount`** — the demo case has 4,260 allocated to an invoice whose charge is 2,260.
  Allocations currently encode "money applied while looking at this invoice", not "money applied
  to this invoice's charges".
- `previous_balance` is stored, so `total_receivable − previous_balance = net_amount` is
  recoverable arithmetically on every existing row. No backfill would be needed to *populate* an
  own-charge figure; the gap is entirely on the payments side.

### 2.5 What breaks under each direction

**A — Split into two columns** (keep `total_receivable` as the statement figure; add/adopt an
own-outstanding notion for the money layer):

- Consumers 1–7 must each be repointed, individually. They are seven different SQL expressions
  in six files; there is no shared helper to change once.
- `bill_payment_allocations` semantics must be settled first — capping allocations at an
  invoice's own charge changes what FIFO does with a payment that exceeds it (today the excess
  silently over-allocates; capped, it becomes advance credit or spills to the next invoice).
  **This is the load-bearing decision, not the column.**
- Existing allocation rows already violate the cap (demo: 4,260 against a 2,260 invoice), so any
  new invariant is retroactively false and needs either a backfill or an explicit
  "pre-cutover rows exempt" rule.
- The printed bill (consumer 8) and both "Total" cards (9, 10) are untouched.
- BILL-8's reprint guarantee is untouched — `total_receivable` keeps its stored value.

**B — Redefine in place** (`total_receivable := net_amount`, drop the carry-forward):

- Consumers 1–7 become correct with **zero code changes**. D32, D33, D25, D28, D34 collapse at
  once.
- Consumers 8, 9, 10 silently change meaning: the printed bill's "Total receivable" stops being
  what the payer owes, and the mobile card's "Total" stops matching the old rail.
- **Every already-posted invoice is retroactively wrong** unless backfilled, and
  `amount_in_words_en/ne` — frozen text on issued documents — would disagree with the new
  figure. BILL-8's byte-identical-reprint guarantee breaks for every historical bill.
- The statement-of-account need does not disappear; it moves to the ledger
  (`getStatement`/`getBalance` already answer it correctly), so the bill would need a separate
  "previous balance / total due" presentation layer that reads the ledger rather than the column.

**Common to both:** `previous_balance` stays needed either way, and the ledger is unaffected —
it never stored `total_receivable` and always debited `net_amount` only. **The ledger has been
right the whole time; every wrong figure is a re-derivation that bypassed it.**

*No recommendation offered, per instruction.*

---

## 3. D19 — when the year rolls, and whether anyone has crossed one

### 3.1 There is no fiscal-year rollover in the billing path

`fiscalYearBs()` / `fiscalYearLabel()` (`bill-post.util.ts`) exist, but their only load-bearing
use is the invoice/receipt **sequence key** under `RESET` numbering.

**All eight tenants have `invoiceNumberingReset = false`.** Every sequence key in use is
`…:CONTINUOUS`. The Nepali fiscal-year boundary (1 Shrawan 2083 = 2026-07-17, five weeks ago)
is therefore **completely inert** across the fleet. That sub-risk is closed.

*(Vestige worth noting: `tenant_demo` holds a stale `bill_invoice:demo:2083 = 1` key alongside
`bill_invoice:demo:CONTINUOUS = 28` — a leftover from FIX-RESET-COLLISION testing. Harmless
while reset stays off; it is exactly the collision that fix exists to prevent.)*

### 3.2 What actually governs the year is a per-tenant row, and nothing enforces it

The billing path takes `academicYearId` **from the request** and validates only
`WHERE id = $1 AND deleted_at IS NULL`. There is:

- **no `is_current` check** anywhere in `modules/finance`, `modules/reports`, or `jobs` —
  `grep is_current` finds exactly one hit in the whole billing surface, in
  `dashboard.service.ts:109`;
- **no validation that `entry_date` falls inside the academic year's `start_date`/`end_date`** —
  `grep` returns nothing.

**The rollover is a slope, not a cliff. Nothing breaks at the boundary because nothing looks at
it.** The academic year is a label carried on rows, chosen by whoever sends the request.

### 3.3 Two tenants have already crossed, and nothing happened

**`tenant_demo` — crossed 39 days ago.**

```
AY "2082-83"  2025-07-16 → 2026-07-15   is_current = TRUE
```

Its only academic year **ended 2026-07-15**. Today is 2026-08-23. There is no successor row. Yet
every one of its 19 invoices (issued 2026-07-26 → 2026-08-10) and all 118 ledger entries (through
2026-08-22) were written **into the expired year**, which is still flagged current. Including all
four eSewa payments from §1.

**`tenant_motherland_school` — already writing across two years, and both are mislabelled.**

```
AY "2081/82"  2026-07-16 → 2027-07-15   is_current = TRUE    9 entries, net  −2,039.66
AY "2083/84"  2027-07-16 → 2028-07-15   is_current = false  89 entries, net  52,959.04
```

The names are two years out from the AD spans they carry. Worse: **89 ledger entries dated
2026-08-10 → 2026-08-13 are stamped with an academic year that does not begin until
2027-07-16** — and that year is not the current one. `academic_year_id` on those rows is not
merely ambiguous; it is false.

Because `getBalance`/`liveBalance` sum across all years with no filter, motherland's balances are
still arithmetically right. The year stamp is simply inert — which is precisely D19's point: the
only thing keeping cross-year data correct is that **nothing reads the year at all.**

### 3.4 Next boundaries

| Tenant | Academic year ends | Status |
|---|---|---|
| `demo` | **2026-07-15 — already passed** | still `is_current`, still accepting invoices |
| `motherland_school` | 2027-07-15 | already writing into a second (future-dated) year |
| `test` | 2027-05-15 | ~9 months out |
| `geetanjali_school_college` | 2027-05-01 | ~8 months out, no billing data |

### 3.5 The deadline answer

**There is no deadline. The boundary that mattered passed on 2026-07-15 and nothing happened —
because nothing in the billing path reads the academic year.** D19 is not a countdown; it is a
standing latent condition. It does **not** move ahead of BILL-SOFTDEL-1 on urgency grounds.

The caveat that keeps it from being closed: D19's real harm arrives the first time someone
*creates* a new academic year and expects a clean opening position. `openingBalance()` guards
only against a duplicate opening entry for the same year — it does not check for, and nothing
closes out, the prior year's residual entries. On this dev DB every tenant's balances are
lifetime sums, so importing an opening balance for a new year today would double-count on **any**
of them.

---

## Scope note

Everything above is `SELECT`-only against the local dev database and static reading of the
working tree at `fd5b9d2`. No fix, test, migration, or write of any kind was performed, and no
remote environment was contacted.
