# BILLING-CALC-AUDIT-1 — rulings and ticket split

Srijan's rulings, 2026-08-23, after Phase 0 (`fd5b9d2`) and Phase 0b (`5d50646`).
**No code has been written. This records decisions and the two reports they asked for.**

---

## Ruling 1 — D15 is a SPLIT, not a redefinition

`total_receivable` **keeps its statement-of-account semantic and stays write-once.** Consumers
repoint to `net_amount`, which is already the invoice's own charge and already the convention in
three places — one of which (`web/lib/invoice-totals.ts`) carries a docblock warning against
this exact mistake.

**Redefining in place is refused.** Recorded reason: `amount_in_words_en` / `amount_in_words_ne`
are **frozen text on an issued document**. Redefining the column makes every historical bill
disagree with the database that produced it.

> An issued artifact is an immutable record — the same rule as the v1 cache, the provisional
> acknowledgement, and refusing-to-serve-is-not-deleting.

---

## Ruling 2 — split the split: BILL-CHECKOUT-1 goes first

**BILL-CHECKOUT-1** covers the two gateway consumers **only** — `esewa.service.ts:184,373` and
`khalti.service.ts:159,361`. Ahead of everything, including BILL-SOFTDEL-1. It is independent of
the allocation-cap decision (Ruling 3) and it stops the live mechanism.

The other five consumers (invoice list `balance`, payment FIFO/MANUAL/status, aging, credit-note
cap, fine base) stay in the D15 ticket.

### 2a. What a parent should see at checkout — the report

**Recommendation: own charge alone on the card. Arrears stay visible, but exactly once, at the
student level — not repeated onto every invoice.**

Arrears are a fact about a **student**, not about an invoice. The current design makes every
invoice restate the whole account position, which is why the same debt appears on three cards
when a parent is three months behind, and why paying one card does not clear the others.

Under own-charge semantics the parent does not lose sight of arrears — **an unpaid earlier month
is already its own card, with its own correct amount and its own Pay button.** The arrears *are*
the list. Nothing needs to be conflated to keep them visible.

Worked against the confirmed dev case (Aarav Shrestha):

| | today | own-charge |
|---|---|---|
| BINV-…000002 card | Pay **2,000** | Pay **2,000** |
| BINV-…000004 card | Pay **4,260** ← own 2,260 + #2's 2,000 | Pay **2,260** |
| total collectable | **6,260** | **4,260** ✓ |

The defect disappears from the arithmetic, with no new API field: **`bsYear`, `bsMonth`,
`netAmount` and `previousBalance` are already on `BillInvoiceResponseDto`** — the mobile
`BillInvoiceApi` interface simply does not declare them. This is a client-side widening plus one
changed server expression per gateway.

**Two labelled figures, at two different altitudes:**

1. **Per invoice card** — this month's bill only.
   Amount = `GREATEST(net_amount − cleared allocations, 0)`.
   The clamp is required *pre-cap*: on the 8 invoices that already breach Ruling 3, allocations
   exceed the own charge, and an unclamped subtraction would go negative.
2. **Screen summary tile** — the account position, **sourced from the ledger**
   (`GET /finance/students/:studentId/balance`), never by summing cards.
   Today `billInvoiceMapping.ts:88-95` computes it with
   `invoices.reduce((a,i) => a + i.balance, 0)` — that is the D33 double-count shown to a
   parent. The web side already got this right and says so in
   `web/lib/invoice-totals.ts`: *"Balance Due is intentionally NOT derived here — it comes from
   the separate, authoritative `GET /finance/students/:studentId/balance`."* Mobile should adopt
   the same rule.

The tile and the card sum will **not** always agree, and that is correct — the ledger also holds
fines, credit notes, adjustments and opening balances, none of which have an invoice. That gap
is the tile's whole reason to exist.

### 2b. Card heading — "Tuition Fee" is the other half of the defect

An invoice is **a month's bill**, not a fee. `invoiceTitle()` currently returns
`items[0].feeCategoryName`, or `"{first} +N more"` — so a bundled figure gets labelled with
whichever fee head happened to sort first.

**Heading should name the period; fee heads become the secondary line.**

```
  Bhadra 2083                                    NPR 2,260
  Tuition, Transport, Library · BINV-2083-000004
  Due 15 Bhadra                        [ Pay NPR 2,260 with eSewa ]
```

`bsYear`/`bsMonth` are already on the DTO and `formatBs` with `bsLang(locale)` is already
imported in `fees.tsx`. The invoice number belongs on the card too — it is what a parent quotes
at the office.

### 2c. Flagged for a decision inside BILL-CHECKOUT-1 — fines become invisible

A BILL-7 late fee is a **ledger entry with no invoice row**. Today it reaches the parent silently,
folded into the *next* invoice's `previous_balance`, while the card's own `fineAmount` renders
`0` (`billInvoiceMapping.ts` — *"BILL-7 fines aren't exposed on this endpoint yet — 0, not
fabricated"*).

Under own-charge semantics a fine will not appear on **any** card. It will exist only inside the
account-balance tile. That is more honest than today, but it means the tile **must be itemisable**
or a parent will see a balance they cannot account for. `getStatement` already returns the
entries needed. **This needs a deliberate answer before BILL-CHECKOUT-1 ships, not after.**

---

## Ruling 3 — allocation cap

An allocation means **"money applied to this invoice," bounded by its own charge.** Existing
violating rows are corrected **forward with compensating entries, never rewritten** — an
allocation is a record of what was booked.

### 3a. The census — the report

Dev database, all 8 tenant schemas, `SELECT` only. The authoritative measure is **per invoice**
(`SUM(cleared allocations) > net_amount`); the per-allocation count is lower because one invoice
can be breached by two allocations that are each individually under the cap.

| Tenant | Allocations | Invoices breaching cap | Excess |
|---|---|---|---|
| `demo` | 20 | **2** | **2,500.00** |
| `motherland_school` | 12 | **6** | **533.23** |
| `test` | 0 | 0 | 0 |
| `geetanjali_school_college` | 0 | 0 | 0 |
| `jorden_donovan` | 0 | 0 | 0 |
| `kaye_nashh` | 0 | 0 | 0 |
| `raja_mcintyres` | 0 | 0 | 0 |
| `stacey_mejia` | 0 | 0 | 0 |
| **Total** | **32** | **8** | **3,033.23** |

Per-allocation view for comparison: demo 2 rows / 2,500.00, motherland 7 rows / 443.23.
The gap (motherland `BINV-2083-000033`: two allocations of 130 + 100 against a 90.00 invoice —
each individually over, and together 140 over) is why the per-invoice figure is the one to use.

**Eight of thirty-two allocations breach the cap — 25% of every allocation ever written.**

### 3b. Three facts the census establishes

**1. Every breach traces to `previous_balance`. Zero from any other cause.**
In all 8 rows the excess is bounded by that invoice's own `previous_balance`, and
`allocation ≤ total_receivable` always holds. There is no second bug hiding in here — one
semantic produced all of it.

**2. It is not a gateway defect.** The breaches span all three allocation modes and both
payment methods: AUTO_FIFO (5 invoices), MANUAL (2), CASH and ESEWA. `fetchUnpaidInvoicesOldestFirst`
reports a candidate's capacity as `total_receivable − allocations`, so **the FIFO engine
over-allocates by exactly the same mechanism a cashier taking cash at the counter triggers.**
BILL-CHECKOUT-1 stops the parent-facing half; the cap is what stops the rest.

**3. Two distinct harm classes — they need different compensating entries.**

- **Misfiling only** — the money is in the right student's account, booked against the wrong
  invoice. *demo / Hari Adhikari*: ledger balance **+1,540**, own charges 6,000 — the student's
  position is correct; only `BINV-2083-000021`'s 500 excess is misfiled. Nothing was
  overcollected; the invoice-level record is wrong.
- **Actual overcollection** — *demo / Aarav Shrestha*: charged 4,260, collected 6,260, balance
  **−2,000**. Real money to return or credit.

**Do not size the remedy off the negative balances.** Of the 5 affected students, 4 are in
credit — but at least one of those (*motherland / Shaine Delaney*) has a deliberate
`ADVANCE_ONLY` deposit of 500 that explains most of it, and the other two motherland students do
not reconcile from allocations alone (other ledger entries are involved). **Attributing each
credit balance to a cause is per-student reconstruction — triage work, not census work, and it
must be done before any compensating entry is posted.** The same distinction is what the
production runbook's Query 2 asks the operator to make by hand.

*No mechanism proposed, per instruction.*

---

## Ruling 4 — production check is the most urgent thing in the module

Written up as a standalone, context-free runbook: **`docs/ops/BILLING-CHECKOUT-PROD-CHECK.md`**
— exact invocation, expected output shape, how to read the result, what not to touch, and what
to report back. Runnable by someone at a terminal who knows nothing about billing.

A gate entry pointing at it was also added to `docs/ops/RUNBOOK.md`'s
*"⚠️ Before a real school goes live"* section — that section exists for exactly this, and the
finding would otherwise not be where an operator looks. *(One line; flagged here because it
edits an existing file.)*

**Production remains unchecked. Everything known about D32 is from the dev database.**

---

## Ruling 5 — D19 stays behind BILL-SOFTDEL-1

Recorded, with the two reasons it is not urgent and the one reason it is not closed:

- **It is inert only because nothing reads the academic year.** `grep is_current` across
  `modules/finance`, `modules/reports` and `jobs` returns exactly one hit, in the dashboard.
  Nothing validates `entry_date` against a year's `start_date`/`end_date`. The boundary passed on
  `demo` on **2026-07-15** — 39 days ago — and nothing happened: the expired year is still
  flagged `is_current` and has taken every invoice and ledger entry since.
- **The fiscal-year sub-risk is closed.** All 8 tenants have `invoiceNumberingReset = false`;
  every sequence key is `…:CONTINUOUS`. The 1 Shrawan 2083 boundary was fleet-wide inert.
- **What keeps it open:** `openingBalance()` guards only against a *duplicate* opening entry for
  the same year. It does not check for, and nothing closes out, the prior year's residual
  entries — and balances are lifetime sums with no year filter. **The first tenant to open a
  Year 2 will double-count.** On this dev DB that is true of every tenant today.

---

*Read-only session. No fix, test, migration, or schema change was made.*

---

## Note — `bsYear` is not in the bill-run idempotency key

*Not a ticket. Found 2026-08-25 while building currency for ALLOCATION-CAP-1's live
verification, recorded here so it is not lost.*

`buildBillRunIdempotencyKey(slug, academicYearId, bsMonth, scope, classId)`
(`bill-run.util.ts`, used at `bill-run.service.ts:61`) omits `bsYear`. A request for
academic year 2082-83 with `bsYear: 2083, bsMonth: 8` is therefore rejected as a duplicate
of the existing **2082/8** run:

```
CONFLICT_DUPLICATE — A bill run already exists for this period and scope
(id=4474785d-…, status=POSTED)
```

**This is defensible and was not changed.** A BS month occurs exactly once inside one
academic year, so `(academicYearId, bsMonth)` does identify a period, and the request that
tripped it was itself incoherent — BS 2083/8 (≈ Nov–Dec 2026) does not fall inside
2082-83 (2025-07-16 → 2026-07-15). The guard arguably caught a real error.

Two things are worth keeping in view anyway:

1. **The message says "this period" while the two periods differ in year**, and names a run
   the caller cannot see is from a different `bs_year`. It cost a detour to diagnose. Naming
   the conflicting run's own `bs_year`/`bs_month` in the message would have made it
   self-explanatory.
2. **`bs_year` is stored on the row and stamped onto every invoice** (`bill_invoices.bs_year`),
   so the column the product treats as part of a run's identity is not part of the key that
   enforces its uniqueness. Nothing today can exploit that gap — it needs a tenant whose
   academic year spans one BS month twice, which the fiscal-year model does not produce. It
   is a latent disagreement between two definitions of "period", of the same family as D19:
   inert only because of a property nothing enforces.

No behaviour was changed. Anyone touching bill-run identity should decide deliberately
whether the key or the message is the thing to fix.

