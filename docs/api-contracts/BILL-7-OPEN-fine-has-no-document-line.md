# BILL-7 open item — a late fee is a charge that produces no document line

Logged 2026-08-23 from BILLING-CALC-AUDIT-1 (Ruling 3, second half). **Not a BILL-CHECKOUT-1
decision and deliberately not fixed there** — that ticket only had to stop a parent being
charged for the same arrears twice. This is BILL-7's call to make.

---

## The observation

**Every other figure in this system produces paper.** A fee produces an invoice line. A
concession produces a line. Transport produces a line. A payment produces a receipt. A credit
note, a refund and a write-off each produce a numbered correction document. All of them are
printable, quotable at the office counter, and reconcilable against something a parent holds.

**A late fee produces none.** `BillFineService.processInvoice` posts a `FINE` ledger entry and a
`bill_fine_accruals` row, and stops there. `bill_fine_accruals` is an audit table, not a
document: no number, no series, no print path, no `bill_invoice_items` row. Nothing in
`bill-pdf.service.ts`, `bill-receipt.service.ts` or `print/invoice-half.ts` renders a fine.

## Why it surfaced now

Before BILL-CHECKOUT-1, a fine did reach the parent — silently, and by accident of a bug.
`total_receivable = net_amount + previous_balance` folded the whole ledger position into the
*next* month's invoice, so an accrued fine turned up inside that invoice's carried balance,
unlabelled, while the card's own `fineAmount` rendered `0`
(`apps/mobile/lib/billInvoiceMapping.ts`: *"BILL-7 fines aren't exposed on this endpoint yet —
0, not fabricated"*).

BILL-CHECKOUT-1 repointed checkout to the invoice's own charge, which was the correct fix for
the double-collection (D32). It also removed the accidental channel. **Under own-charge, a fine
appears on no invoice card at all** — and cards are the only surface with a Pay button.

So today a fine is:

- **visible** — it moves the ledger balance, which the parent's account tile shows, and the
  BILL-CHECKOUT-1 statement drill-down itemises it as "Late fee";
- **payable nowhere** — there is no card, therefore no Pay button, therefore no gateway path
  that targets it.

The statement screen is the *minimum* that keeps the balance explainable. It is not a
resolution: it tells a parent what they owe and gives them no way to pay it.

## Worked example — live, demo tenant, 2026-08-23

**Binod Gurung** (`tenant_demo`), read through the real PARENT-scoped endpoints during
BILL-CHECKOUT-1 Phase 2 verification:

| Source | Figure |
|---|---|
| Sum of his invoice cards' own balances | **2,260** |
| `GET /finance/students/:id/balance` — the account tile | **2,300** |
| **Gap** | **40** |

The 40 is a late fee. `GET /finance/students/:id/statement` renders it:

```
2083-04-10  INVOICE  DR 1000   run=1000   Invoice BINV-2083-000003
2083-04-10  INVOICE  DR 2260   run=3260   Invoice BINV-2083-000005
2083-04-26  PAYMENT  CR 2000   run=1260   Payment RCPT-2083-000015
2083-04-26  PAYMENT  DR 2000   run=3260   Reversal of entry c377cb69…
2083-04-27  PAYMENT  CR 1000   run=2260   Payment RCPT-2083-000021
2083-04-31  FINE     DR   40   run=2300   Late fee — 4 day(s) overdue
```

So for this parent, today: **40 rupees are owed, appear on no card, and are payable
nowhere.** The tile shows 2,300; every Pay button on the screen adds up to 2,260; the
statement explains the difference and offers no way to settle it.

That is the whole item in one student. It is not hypothetical and it is not an edge case —
Binod is one of nine demo students carrying a live `FINE` entry.

## The decision BILL-7 owns

Whether a fine should:

1. **generate a line on the next invoice** — cheapest, matches how a parent already reads a
   monthly bill, but the line has to be attributable to the *originating* invoice and dated to
   the accrual, not to the billing period it lands in; or
2. **generate its own invoice** — a real document with its own number and print path, payable
   like any other card, at the cost of a second document series and a bill-run path that emits
   invoices outside the monthly cycle; or
3. **stay a ledger-only charge**, explicitly, with the statement as its only surface — in which
   case the product needs an answer for how a parent settles it, because "you owe this and
   cannot pay it" is not an acceptable end state.

Option 3 is the status quo and is the one thing that should not be arrived at by default.

## Constraints any option must respect

- `bill_fine_accruals` has `UNIQUE (bill_invoice_id, accrued_through)` and is the B7-10
  idempotency backstop. A document series must not become a second, competing idempotency key.
- Fines already ratchet: `processInvoice` returns `null` when `delta <= 0`, so an over-accrual
  is never unwound (BILLING-CALC-AUDIT-1 **D29**). A document that says "Late fee: 500" must not
  outlive a subsequent recomputation that would have made it 300.
- Reversing an accrual is currently undone by the next run (**D27**): `already_posted` excludes
  reversed accruals, so the next night re-posts the delta under a fresh `accrued_through`. Any
  document line inherits that behaviour unless D27 is fixed first.
- The fine base is `total_receivable`-derived, so PERCENT fines currently compound on carried
  arrears (**D28**). A printed fine line makes that compounding visible to a parent, which is
  either an improvement or an embarrassment depending on whether D28 is fixed first.
- Gapless numbering (R13) — if a fine gets its own document, it needs its own `sequences`
  doctype, never sharing `bill_invoice`'s or `receipt`'s counter (see `bill-post.util.ts`).

## Related audit findings

D27 (reversal re-applied next run), D28 (fine base includes carried balance, PERCENT compounds),
D29 (over-accrual never unwound), D30 (a FEE_HEAD-scoped rule fines the whole invoice). Full
detail: `BILLING-CALC-AUDIT-1-phase0.md` §F.

**Ordering note:** D27–D30 are corrections to what a fine *is*. This item is about what a fine
*produces*. Settling the arithmetic first would be reasonable — a document that prints a figure
the engine is still going to revise is worse than no document.

---

*Source: `docs/api-contracts/BILLING-CALC-AUDIT-1-rulings.md` Ruling 3.
Surfaced by BILL-CHECKOUT-1 (`feat/bill-checkout-1`), not caused by it.*
