# BILLING-CUTOVER Phase 1 — Parent completeness audit

**Status:** Audit complete, one finding open for a scope decision (see §1). Per the discovery
doc's Phase 1 checkpoint, this is a report — no gap has been closed beyond the fee-structure
section swap that was already in flight when this phase started.

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

## §1 — The one real finding: the parent Fees page reads the wrong rail

`apps/web/app/(portal)/parent/fees/page.tsx`'s summary cards and invoice list are wired to
`useStudentLedger()` (`lib/hooks/use-finance.ts:234`), which calls
`financeApi.getStudentLedger` → **`GET /finance/reports/student/:studentId`** — the **old Finance
rail**, reading straight from the `invoices` table. Billing's own equivalent,
`GET /finance/students/:studentId/ledger` (+ `/statement`, `/balance`), reads from
`bill_invoices` / `student_ledger_entries` — a completely separate table, per the discovery doc's
"no data migration" premise.

**Confirmed live, same child (Binod Gurung), same moment:**

| | Old rail (`reports/student/:id`) — currently wired | Billing rail (`students/:id/ledger`) — not wired |
|---|---|---|
| Invoices shown | 1 | 2 |
| Total invoiced | Rs. 100 | Rs. 3,260 (gross across both invoices) |
| Balance | Rs. 0 | Rs. 2,260 owed |
| Activity | none | 2 invoices, a payment, a reversal, a second payment |

Postgres confirms the scale of the gap tenant-wide, not just for this one student:

```
tenant_demo:  old `invoices` table = 2 rows   |  `bill_invoices` = 19 rows
              old `payments` table = 1 row    |  `bill_payments` = 23 rows
```

A parent logging into the portal today sees almost nothing — the real, current billing activity
(the 19-invoice, 23-payment, 99-ledger-entry picture Billing actually holds) is invisible to them.

**Why this isn't a one-line hook swap** (scoping note for whoever picks this up):

- `InvoiceDetail` (old Finance shape: `subtotal`/`discountAmount`/`fineAmount`/`items`/`payments`)
  and Billing's invoice shape (`grossAmount`/`concessionAmount`/`taxAmount`/`netAmount`/
  `previousBalance`/`totalReceivable`, status `POSTED`/`SETTLED`/…) are structurally different — a
  new type + a new `InvoiceCard` rendering, not a drop-in.
- `StatusBadge` only has color mappings for old Finance's statuses (`PAID`/`UNPAID`/`OVERDUE`/
  `PENDING`); Billing's invoice status enum needs its own mapping added.
- The natural target isn't a single endpoint — `GET /finance/students/:studentId/bill/invoices`
  for the list, plus either `/ledger` or `/statement` for the summary numbers (statement adds
  opening/closing framing the current summary cards don't have).

This is exactly the kind of thing Phase 1 exists to catch. Per the discovery doc's own checkpoint
("report gap list before deciding whether to close gaps now or descope"), this fix was **not**
applied as part of this session — it's a materially bigger, separate change from the fee-structure
section swap that was already in flight, and needs an explicit go-ahead given it touches the
page's primary content, not just a secondary panel.

## §2 — Fee-structure section swap (completed this session)

`FeeStructureSection` (built against old Finance's `GET /finance/students/:studentId/assignments`
via `useStudentAssignments`) replaced with the admin's existing `FeePreviewPanel`, which calls
Billing's `GET /finance/students/:studentId/fee-preview` — already PARENT-allowed and
object-scoped (`fee-preview.service.ts:92`, `assertGuardianOwnsStudent`).

- `apps/web/app/(portal)/parent/fees/page.tsx`: tsc clean, 528/528 web vitest passing.
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

1. **§1 (wrong-rail data source) needs an explicit decision**: fix now as a Phase-1 fast-follow
   (bigger diff than this session's swap, touches the page's primary content and needs a new
   invoice type + status mapping), or track it as a named follow-up before Phase 4 (hard
   retirement) — it must be resolved before Phase 4 deletes the `invoices`/`payments` tables this
   page currently reads from, or the page will 500/break outright at that point regardless.
2. §3 items (receipt/PDF/statement UI) are safe to descope for v1 — no parity requirement, purely
   additive value.
3. No other parent-facing gap found. Billing's backend surface for PARENT is otherwise a strict
   superset of old Finance's.
