# BILLING-CUTOVER Phase 1 — Parent completeness audit

**Status:** Audit complete, all findings closed. §1 (wrong-rail data source) has been fixed and
live-verified; §3 remains a deliberate, documented descope for v1 (no parity requirement).

**Method:** Live HTTP against the running dev API (`localhost:3001`) as a real demo PARENT
(`parent@demo.school`, password temporarily shimmed/verified/401-restored), cross-checked against
direct Postgres reads on `tenant_demo`. Cross-family IDOR probes run against every endpoint using a
student (`Om Subedi`) not linked to that parent. No mocked tests substituted for this — matches the
discovery doc's explicit proof bar.

## Old Finance's actual parent-facing surface

Grepped `finance.controller.ts` (the pre-Billing rail) for every route carrying `Role.PARENT`.
There are exactly two:

| Route | Purpose |
|---|---|
| `GET /finance/students/:studentId/assignments` | Fee-structure assignment display |
| `GET /finance/reports/student/:studentId` | Student ledger (summary + invoice list) |

That's the complete old-Finance parent surface — no payment list, no receipt, no PDF, no statement
were ever reachable by PARENT on the old rail.

## Billing's parent-facing surface (confirmed live, this session)

| Route | Live result (PARENT, own child) | Cross-family probe |
|---|---|---|
| `GET /finance/students/:studentId/fee-preview` | 200, real per-head breakdown (see §2) | 403 |
| `GET /finance/students/:studentId/ledger` | 200, 5 real entries, running balance | 403 |
| `GET /finance/students/:studentId/balance` | 200, `{balance: 2260, sign: "OWES"}` | 403 |
| `GET /finance/students/:studentId/statement` | 200, opening/closing balance + entries | 403 |
| `GET /finance/students/:studentId/bill/invoices` | 200, 2 real invoices | 403 |
| `GET /finance/bill/invoices/:id` | 200 | 403 |
| `GET /finance/bill/invoices/:id/pdf` | 200, presigned URL → fetched, `%PDF-1.3`, 18KB | 403 |
| `GET /finance/bill/payments/:id` | 200, full allocation detail | 403 |
| `GET /finance/bill/payments/:id/receipt` | 200, presigned URL → real PDF | 403 |

Every route is object-scoped via the same `assertGuardianOwnsStudent` (or equivalent) pattern used
everywhere else in Billing — confirmed by reading each service, not just the controller's `@Roles()`
decorator. **Billing's parent surface is a strict superset of old Finance's** — receipts, PDFs, and
a proper statement never existed for parents on the old rail at all. Per the discovery doc's own
framing ("what Finance had for parents that Billing doesn't yet cover"), there is no backend gap.

## §1 — RESOLVED: the parent Fees page was reading the wrong rail

`apps/web/app/(portal)/parent/fees/page.tsx`'s summary cards and invoice list were wired to
`useStudentLedger()` (`lib/hooks/use-finance.ts:234`), which calls
`financeApi.getStudentLedger` → **`GET /finance/reports/student/:studentId`** — the **old Finance
rail**, reading straight from the `invoices` table. Billing's own equivalent reads from
`bill_invoices` / `student_ledger_entries` — a completely separate table, per the discovery doc's
"no data migration" premise.

**Confirmed live, same child (Binod Gurung), same moment, before the fix:**

| | Old rail (`reports/student/:id`) — was wired | Billing rail — not wired |
|---|---|---|
| Invoices shown | 1 | 2 |
| Total invoiced | Rs. 100 | Rs. 3,260 (gross across both invoices) |
| Balance | Rs. 0 | Rs. 2,260 owed |
| Activity | none | 2 invoices, a payment, a reversal, a second payment |

Postgres confirmed the scale of the gap tenant-wide, not just for this one student:

```
tenant_demo:  old `invoices` table = 2 rows   |  `bill_invoices` = 19 rows
              old `payments` table = 1 row    |  `bill_payments` = 23 rows
```

### The fix

Rewired onto three separate Billing endpoints, deliberately not a single swap, because no single
endpoint carries everything the old summary cards + invoice list needed:

- **Invoice list**: `GET /finance/students/:studentId/bill/invoices` (`BillInvoiceController
  #findByStudent` — not `#findAll`, which is ACCOUNTANT_AND_ABOVE-only and would 403 a parent). New
  client method `billInvoiceApi.listByStudent` + hook `useStudentBillInvoices` (year-scoped,
  `limit: 100`, same bound `useStudentOutstandingInvoices` already uses for the payment counter).
- **Balance Due**: `GET /finance/students/:studentId/balance` via the already-existing
  `useStudentBalance` (built for UI-4, zero new code) — the single authoritative ledger-SQL sum,
  not derived from the invoice list. This matters: an invoice's own `balance` field includes its
  `previousBalance` carry-forward from the prior invoice in the same billing chain, so summing
  `balance` across a student's invoices double-counts every carry-forward. Confirmed live on this
  exact data: summing per-invoice `balance` gives Rs. 3,260, but the true, authoritative balance
  (and what `/balance` correctly returns) is Rs. 2,260.
- **Total Invoiced / Total Paid**: summed client-side from the same invoice list via a new pure
  helper, `sumInvoiceTotals` (`lib/invoice-totals.ts`) — `netAmount` (this invoice's own charge,
  not `totalReceivable`, for the same double-counting reason as balance) and `paidAmount`
  respectively. Pinned with a regression test (`lib/__tests__/invoice-totals.test.ts`) using this
  exact live data, including a case that would fail if the double-counting trap were reintroduced.

**Type/status handling, not a shim:**
- `BillInvoice.status` was `string` in `types/api.types.ts`; narrowed to the real union
  (`'POSTED' | 'SETTLED' | 'PARTIALLY_PAID' | 'VOIDED'`) — zero other consumers existed yet, so this
  was a safe tightening, not a breaking change.
- New `BillInvoiceStatusBadge` component (`components/finance/bill-invoice-status-badge.tsx`),
  typed to that union, mirroring the exact established pattern of its siblings
  (`InvoiceStatusBadge` for old Finance's enum, `BillPaymentStatusBadge` for payment status) — not
  an extension of the old `StatusBadge`/`InvoiceStatusBadge`, which are typed to old Finance's
  different status set (`PAID`/`PARTIAL`/`UNPAID`/`OVERDUE`/`WAIVED`).
- `InvoiceCard` now takes a `BillInvoice` (not `InvoiceDetail`) and renders `totalReceivable` (the
  full amount the invoice carries, matching what "Total" meant on the old rail) /`paidAmount`
  /`balance` — all real fields on the new shape, no field renamed or coerced.

**Live-verified after the fix, same child, same endpoints the page now calls (PARENT,
`parent@demo.school`, shimmed/verified/401-restored):**

```
GET /finance/students/:id/bill/invoices?academicYearId=...&limit=100
  BINV-2083-000005: netAmount 2260, totalReceivable 3260, paidAmount 0,    balance 3260, POSTED
  BINV-2083-000003: netAmount 1000, totalReceivable 1000, paidAmount 1000, balance 0,    SETTLED
  -> Total Invoiced = 3260, Total Paid = 1000

GET /finance/students/:id/balance
  {"balance": 2260, "sign": "OWES"}  -> Balance Due = Rs. 2,260
```

Postgres read-back (direct query against `bill_invoices` joined to `bill_payment_allocations`
filtered to `bill_payments.status = 'CLEARED'` — the reversed Rs. 2,000 payment is `VOIDED` and
correctly excluded) reproduces both invoice rows and both sums exactly. The ledger's own
`SUM(debit) - SUM(credit)` independently reproduces the Rs. 2,260 balance exactly. All three numbers
the page now shows are independently confirmed against raw Postgres, not just trusted from the API.

Cross-family probe (Om Subedi, not this parent's child) on both newly-wired endpoints: 403.

The old rail's Rs. 0 balance / 1 invoice is now Rs. 2,260 owed / 2 invoices — matching what Billing
actually holds. This closes the finding; no further data-source work needed before Phase 4.

## §2 — Fee-structure section swap (completed this session)

`FeeStructureSection` (built against old Finance's `GET /finance/students/:studentId/assignments`
via `useStudentAssignments`) replaced with the admin's existing `FeePreviewPanel`, which calls
Billing's `GET /finance/students/:studentId/fee-preview` — already PARENT-allowed and
object-scoped (`fee-preview.service.ts:92`, `assertGuardianOwnsStudent`).

- `apps/web/app/(portal)/parent/fees/page.tsx`: tsc clean, 528/528 web vitest passing at the time
  (531/531 after §1's fix added `invoice-totals.test.ts`).
- Live proof (PARENT, own child, after a temporary crafted assignment — see below): `GET
  /finance/students/:studentId/fee-preview` returned a real per-head breakdown (`Tuition Fee`,
  gross 1200, net 1200) matching a direct Postgres read of `bill_fee_structure_items` +
  `fee_heads` exactly.
- Cross-family probe: 403.
- Neither of `parent@demo.school`'s two linked children had a live fee-structure assignment for
  the current year going in (only one student tenant-wide did, and they have no parent account) —
  a temporary assignment was created via the real `POST /finance/students/:studentId/fee-structure`
  endpoint (as `owner@demo.school`, shimmed the same way) to exercise the non-empty-state path
  live, then removed (`DELETE FROM student_fee_structure_assignments`, row-count read-back
  confirmed 0 after). The 404 "not assigned" empty state was also confirmed directly (both
  children, before the crafted assignment) — the component's own documented expected state, not
  an error.
- The old test `fee-structure-section.test.tsx` pinned a key-prop bug specific to the now-deleted
  component; no replacement test was added — matches this repo's established convention of
  live-HTTP+Postgres proof over new unit tests for view-only screens (see WEB-P Phase 4/5 notes in
  CLAUDE.md), and `FeePreviewPanel` itself carries no dedicated test on the admin side either.

## §3 — Payment history, receipts, statements: not yet surfaced in the parent UI

Backend parity is confirmed (§ table above — receipt and PDF both return real, storage-backed
PDFs; statement returns opening/closing framing). But grepping the parent portal tree found no
UI anywhere for: a per-invoice detail view, a receipt download, a PDF download, or a statement
view. **This is not a Billing gap** (old Finance never had these for parents either — nothing to
have parity with), so it doesn't block cutover, but it's a real gap versus what a parent could
plausibly expect from a "Fees" screen. Flagging as a **descoped-for-v1 enhancement**, not a Phase 1
blocker, consistent with the existing HARD EXCLUSION already documented in `fees/page.tsx`'s
docblock (checkout intentionally excluded; per-invoice detail/expand was already "not speced for
v1" going into this phase).

## Recommendation

1. **§1 is closed** — the parent Fees page is fully off the old Finance rail (no remaining
   `use-finance.ts` imports in `fees/page.tsx`), so nothing on this page depends on the
   `invoices`/`payments` tables Phase 4 will delete.
2. §3 items (receipt/PDF/statement UI) are safe to descope for v1 — no parity requirement, purely
   additive value.
3. No other parent-facing gap found. Billing's backend surface for PARENT is otherwise a strict
   superset of old Finance's.
