# BILL-RCPT-STATUS — Phase 0

**Status: BLOCKING. Research only — no code written.**

**The defect:** `GET /finance/bill/payments/:id/receipt` performs no status check whatsoever. A
BOUNCED or VOIDED payment prints a receipt headed **"Amount received — Rs. 1,500.00"** for money
that was never received, or was received and then reversed. `BillPaymentService.findOne` filters
only `deleted_at IS NULL`; nothing downstream reads `status`.

Pre-existing — the endpoint is BILL-8's, not BILL-PRINT-1's. Surfaced now because BILL-PRINT-1 is
the first work to render these receipts against real records.

---

## 1. The status enum

From the live CHECK constraint on `bill_payments`:

```sql
CHECK (status IN ('CLEARED', 'PENDING', 'BOUNCED', 'VOIDED'))
```

Four values. There is no `status` column default; `BillPaymentService.create` assigns it —
**`CHEQUE` is born `PENDING`, every other method is born `CLEARED`** (`bill-payment.service.ts:173`).

## 2. Counts per status, both tenants

| Tenant | Status | Rows | Ledger posted | Ledger NULL | Total value |
|---|---|---|---|---|---|
| `demo` | **CLEARED** | 8 | 8 | 0 | 25,260.00 |
| `demo` | **VOIDED** | 13 | 12 | **1** | 20,327.00 |
| `demo` | **BOUNCED** | 3 | 1 | **2** | 5,760.00 |
| `demo` | PENDING | 0 | — | — | — |
| `motherland-school` | **CLEARED** | 7 | 7 | 0 | 11,900.00 |
| `motherland-school` | *(no other status present)* | | | | |

**16 of 31 demo payments (52%) are in a non-CLEARED state and every one of them will print a
receipt today.** `motherland-school` is entirely CLEARED, so the problem is invisible there.

Note the `ledger_entry_id` split: BOUNCED and VOIDED rows are **mixed**. A payment that was
`PENDING → BOUNCED` never posted (NULL); one that was `CLEARED → BOUNCED` posted and was then
reversed (the entry id remains, pointing at the original). Both are "dead", but only one has a
ledger position at all — which is why BILL-PRINT-1 now suppresses the balance-after line on NULL
rather than guessing.

## 3. Every code path that reads `bill_payments.status`

**One rule does almost all the work.** Per the service's own header comment, a `PENDING` cheque's
allocations are inserted immediately but must not count until it clears, and
`bp.status = 'CLEARED'` gating every join to `bill_payment_allocations` is what makes
PENDING/BOUNCED/VOIDED all stop counting without a separate branch each.

| Path | File | What it does |
|---|---|---|
| Invoice paid/balance | `bill-invoice.service.ts:54, 87` | `EXISTS (… bp.status = 'CLEARED')` — non-cleared allocations don't reduce a bill |
| Payment lists / outstanding | `bill-payment.service.ts:302, 322, 348, 354` | same CLEARED gate |
| Fine calculation | `bill-fine.service.ts:196` | `JOIN … AND bp.status = 'CLEARED'` |
| Dashboard collection | `dashboard.service.ts:136, 277` | `bp.status = 'CLEARED'` |
| Ledger posting | `bill-payment.service.ts:203` | posts a ledger entry **only** when `status === 'CLEARED'` |
| Status transition guard | `bill-payment.service.ts:377-380` | only `PENDING` and `CLEARED` may transition; `CLEARED` may only go to `BOUNCED` |
| Void guard | `bill-payment.service.ts:471-472` | already-VOIDED conflicts; **BOUNCED cannot be voided** |
| List filter | `bill-payment.service.ts:252` | optional `?status=` query filter |

**Not in that list: anything in the receipt/print path.** `bill-receipt-document.service.ts`
contains zero references to `status`, and `findOne` (`bill-payment.service.ts:271-285`) selects
`WHERE id = $1 AND deleted_at IS NULL` with no status predicate.

So the money rails are correct and consistent — **the print surface is the one place the rule was
never applied.**

## 4. What the receipt endpoint does for each status today

| Status | Endpoint | What prints |
|---|---|---|
| `CLEARED` | 200 | Correct. |
| `PENDING` | **200** | "Amount received" for a cheque **not yet cleared**. Balance-after suppressed (no ledger entry) after BILL-PRINT-1. |
| `BOUNCED` | **200** | "Amount received" for money that **never arrived**. If it bounced from CLEARED the ledger entry still exists, so a balance-after **does** print — reflecting a reversed position. |
| `VOIDED` | **200** | "Amount received" for a payment that has been **reversed**. Same ledger caveat. |

No status appears anywhere on the document — a parent holding a bounced-cheque receipt cannot tell
it apart from a good one.

## 5. Does any status mean "received but not yet cleared"?

**Yes — `PENDING`, and it is genuinely distinct from `BOUNCED`.**

`PENDING` is the cheque-in-hand state (`B5-5 cheque lifecycle`): the school physically holds the
instrument, allocations are already recorded against the intended invoices, but no ledger entry
exists and nothing counts until the bank clears it. Transitions are `PENDING → CLEARED` (posts the
ledger entry, `:392-409`) or `PENDING → BOUNCED` (`:417`).

That matters for your ruling, because the three non-CLEARED states are not one category:

- **`PENDING`** — *we have your cheque; it has not cleared.* Money plausibly arriving. A school
  genuinely may want to hand over an acknowledgement, but it must not say "Amount received".
- **`BOUNCED`** — *the instrument failed.* No money, ever. An acknowledgement is actively harmful.
- **`VOIDED`** — *recorded then reversed* (error, refund, cancellation). Money may have moved and
  come back.

`demo` has zero PENDING rows today only because no cheque is mid-flight; the state is reachable the
moment one is recorded.

## 6. What the ruling has to decide

1. **Refuse or render?** Per status, not globally — PENDING has a real use case that BOUNCED does
   not.
2. **If render, how is the state shown?** The brief forbids a watermark. Options: a status line in
   the party block; a different document title (`ACKNOWLEDGEMENT` rather than `RECEIPT`) for
   PENDING; a footer note.
3. **Does the heading change?** "Amount received" is the false statement for PENDING and BOUNCED.
   A PENDING slip would need something like "Amount tendered".
4. **Reprints of already-issued receipts.** A payment CLEARED, a receipt was printed and handed
   over, then it bounced. The stored PDF is cached at a deterministic key and is byte-identical on
   reprint — correctly, since it records what was issued. Should a *later* reprint of that same
   receipt refuse, given the payment is now dead?
5. **Scope beyond print.** The gateway-facing endpoints already gate on status. This ticket is the
   receipt surface only unless you widen it.

**Not recommending a rule here** — you asked for the facts to rule from.

## 7. Blast radius of a refuse-by-default rule

The web print surface calls `GET /finance/bill/payments/:id/receipt` from the payments list row
menu, the payment detail modal, and the payment-recorded confirmation. A 4xx would need handling at
all three; today they show a generic failure toast, and `printErrorMessage` already has a precedent
for a specific message (`STORAGE_UNAVAILABLE`). Mobile has no receipt path at all.
