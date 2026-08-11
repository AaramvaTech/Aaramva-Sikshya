# UI-4 Checkpoint A — Payment Counter (backend + web)

**Target path in repo:** `docs/api-contracts/UI-4-CHECKPOINT-A-SPEC.md`
**Branch (not yet created):** `feat/ui-4-payment-counter`
**Depends on:** UI-1/UI-2/UI-3 (merged) — reuses the "Billing" nav section, `DataTable`/`ConfirmDialog`/status-badge conventions, and the student-search-picker pattern from `generate-invoice-dialog.tsx`.
**Covers:** the BILL-5 payment-recording surface — a cashier/accountant "Payment Counter" web page (record a payment, browse payment history, manage cheque status, void), plus the one backend addition it needs (a balance field on the invoice-list endpoint). Fourth of seven Billing-rail phases (Catalog ✓ → Assignment ✓ → Bill Runs ✓ → **Payment Counter** → Corrections → Reports → Settings).
**Status:** Spec only. Not built. Stop point: Srijan reviews and rules on the flagged decisions (§0, §3.2) before any code is written.

**Scope note — this is Checkpoint A of two.** Checkpoint B (the mobile parent-facing Pay repoint — `docs/api-contracts/PAY-UI-REPOINT-discovery.md`) depends on this checkpoint's balance-field fix and gets its own spec once this one ships, per the approved split (mirroring `BILL-5-SPEC.md`'s own Checkpoint C precedent: gateway/mobile work isolated behind a different proof loop).

---

## 0. What this checkpoint does and does not do

**Does:** one backend read addition (balance field on the invoice-list endpoint, §2) and one new web surface — a payment-counter page for recording CASH/CHEQUE/BANK_TRANSFER/ESEWA/KHALTI payments against a student's outstanding `bill_invoices`, with allocation-mode choice, cheque-lifecycle actions, and void.

**Does not:**
- Touch mobile at all — that's Checkpoint B, spec'd separately once this merges.
- Touch the old-rail `payment-form.tsx`/`/finance/invoices` page — untouched, stays exactly as-is, same non-interference rule every prior UI-x phase has followed.
- Build cashier daily-close UI. `CashierController`/`cashier-shift.service.ts` (BILL-9) exist backend-only with zero web UI — genuinely adjacent (same cash-handling domain) but ruled out of this checkpoint: daily-close is reconciliation (audit/report), not payment-recording, and belongs with UI-6 Reports alongside BILL-9's other reporting endpoints. Logged as `UI-6-SCOPE-CASHIER-UI` in `BILL-BUGS.md` so it's tracked when UI-6 gets speced.
- Allow editing a posted payment. B5-11: a posted payment is immutable — void (reverse) is the only correction path. No "edit" button anywhere in this UI.
- Extract the CLEARED-allocation-sum SQL into a shared helper. It's about to become a *fourth* copy of the same fragment (already duplicated in `esewa.service.ts`, `khalti.service.ts`, twice in `bill-payment.service.ts`) — genuinely tempting to share, and I flagged it as a candidate during discovery. But this codebase's own established convention is one private copy per file (`toIso`/`toDateOnly` duplicated in both `bill-run.entity.ts` and `bill-invoice.entity.ts`, each with an explicit comment naming this as deliberate) — and a shared SQL-fragment helper would be a genuinely new pattern this codebase has never used. Following precedent over inventing one: one more local copy in `bill-invoice.service.ts`. Cheap to revisit if a fifth copy ever shows up.
- Check or build for dark mode. Standing rule, unchanged since UI-1: `forcedTheme="light"`, light mode only.

---

## 1. What already exists — confirmed by reading source (not the discovery doc's summary of it)

**`BillPaymentController`** (`@Controller('finance')`), all routes re-read live:

| Route | Role | Body / notes |
|---|---|---|
| `POST bill/payments` | ACCOUNTANT_AND_ABOVE | `CreateBillPaymentDto` — see §3.2 for full field list. MANUAL allocation additionally gated **in the service, not `@Roles()`** (`bill-payment.controller.ts:37-39`) — a plain ACCOUNTANT posting AUTO_FIFO/ADVANCE_ONLY is fine, MANUAL 403s below PRINCIPAL. |
| `GET bill/payments` | ACCOUNTANT_AND_ABOVE | filters: `studentId`, `method`, `status`, `dateFrom`/`dateTo` |
| `GET bill/payments/:id` | + PARENT | object-scoped |
| `PATCH bill/payments/:id/cheque-status` | ACCOUNTANT_AND_ABOVE | `{ status: CLEARED\|BOUNCED, reason? }` — the only allowed transition |
| `POST bill/payments/:id/void` | **OWNER_ONLY** | `{ reason? }` |

**`CreateBillPaymentDto`** (`dto/bill-payment.dto.ts`): `studentId`, `academicYearId`, `amount` (money-string), `method` (`CASH\|CHEQUE\|BANK_TRANSFER\|ESEWA\|KHALTI`), `allocationMode` (`AUTO_FIFO\|MANUAL\|ADVANCE_ONLY`), `targets?: {billInvoiceId, amount}[]` (MANUAL only, validated service-side same as `CreateBillRunDto`'s classId convention), `receivedDate?`, `reference?`, `notes?`, `chequeBank?`/`chequeDate?` (CHEQUE only, service-validated).

**`BillPaymentResponseDto`** (`entities/bill-payment.entity.ts`): full record incl. `receiptNumber`, `status`, `allocationMode`, `ledgerEntryId`, `clearedAt`/`clearedBy`, `bouncedAt`/`bouncedBy`/`bounceReason`, `voidedAt`/`voidedBy`/`voidReason` — everything the payment-detail/receipt view needs is already on this one response, no extra call required.

**Invoice-list gap — re-confirmed live, unchanged since the July discovery doc:** `BillInvoiceResponseDto` (`entities/bill-invoice.entity.ts:54-82`) has `totalReceivable` but no `paidAmount`/`balance`. `bill-invoice.service.ts`'s `findAll`/`findOne` (re-read in full) have no payment-allocation join at all. The exact fix pattern already exists, written in `bill-payment.service.ts`'s `fetchUnpaidInvoicesOldestFirst`/`fetchInvoicesByIds` (lines 292-326):

```sql
SELECT bi.id, bi.total_receivable - COALESCE(SUM(bpa.amount), 0) AS outstanding
FROM bill_invoices bi
LEFT JOIN bill_payment_allocations bpa
  ON bpa.bill_invoice_id = bi.id
  AND EXISTS (SELECT 1 FROM bill_payments bp WHERE bp.id = bpa.bill_payment_id AND bp.status = 'CLEARED')
```

The `EXISTS` (not a plain join + status column) is deliberate, per that file's own comment: a PENDING/BOUNCED/VOIDED payment's allocations must not count as outstanding-reducing, and this shape makes them simply not appear in the SUM rather than needing a `CASE` to zero out.

**Existing web patterns, confirmed by reading the actual files:**
- `generate-invoice-dialog.tsx` — the 300ms-debounced student-search dropdown (name + admission no.) is the direct lift for the payment counter's "who's paying" step.
- `payment-form.tsx` (old rail) — RHF + Zod, method `<Select>`, conditional-required `reference` field on non-cash methods. Good starting shape for the money-entry fields, but structurally too narrow to lift wholesale: it's single-invoice-scoped (`invoice.balance` is its one max-amount bound), where `CreateBillPaymentDto` targets a **student** with allocation deciding where the money lands — genuinely more form, not a rename.
- `invoice-detail-modal.tsx` (old rail) — the shape to mirror for a payment's own read-only detail view (modal, not a page — a single record with a fixed, bounded set of fields, same as this one).
- **Zero existing precedent for cheque-status actions, allocation-mode UI, or a cashier surface of any kind** — confirmed by grep (`cheque|allocation|cashier` across `apps/web/components` and `apps/web/lib`): no hits anywhere, old rail or new.
- Status-badge precedent: `invoice-status-badge.tsx` and UI-3's `bill-run-outcome-badge.tsx` — both a small dedicated component with its own `styles`/`labels` maps, not the generic `<StatusBadge>`. Same shape needed for `bill_payments.status` (`CLEARED\|PENDING\|BOUNCED\|VOIDED`).
- Role-gating precedent for MANUAL allocation (PRINCIPAL_AND_ABOVE, matching the backend's `MANUAL_ALLOCATION_ROLES`): the verified-live pattern from UI-2/UI-3 is `useAuthStore((s) => s.user?.role)` + a local tier check (`reports/page.tsx:459`'s pattern) — this is a per-element gate, not a whole-route gate, so `route-access.ts`'s `ROUTE_ACCESS` array (route-level only) doesn't apply here directly; `OWNER_PRINCIPAL` already exists as a tier constant in that file and is the right set to mirror (school-web callers only — `PLATFORM_ADMIN` isn't a normal web-session role here).

---

## 2. The backend addition — balance field on the invoice-list endpoint

Widen `bill-invoice.service.ts`'s `findAll` and `findOne` queries with the JOIN shown in §1, add `paidAmount`/`balance` to `BillInvoiceRow`/`BillInvoiceResponseDto` (`entities/bill-invoice.entity.ts`), map in `toBillInvoiceResponse`. Both queries need it: `findAll` for the payment counter's "this student's outstanding invoices" list, `findOne` for a single invoice's context on the payment-detail/receipt view.

- **New fields:** `paidAmount: number` (`COALESCE(SUM(bpa.amount), 0)` from the CLEARED-only join), `balance: number` (`total_receivable - paidAmount`, i.e. the same `outstanding` figure `bill-payment.service.ts` already computes for its own FIFO logic — same formula, independently reflected here since this is a read path, not the write path that formula serves).
- **No new query param needed** — `BillInvoiceQueryDto` already has `studentId`/`status` filters (confirmed in `bill-invoice.service.ts`), sufficient for "this student's outstanding invoices."
- **Test:** new case in the existing `bill-invoice.service.spec.ts`, mirroring `bill-payment.service.spec.ts`'s own CLEARED-vs-PENDING fixture shape — an invoice with one CLEARED allocation and one PENDING (never-cleared) allocation must show `balance` reflecting only the CLEARED one.

Everything else in this checkpoint is UI-only against already-live endpoints.

---

## 3. The web payment-counter — screens, field by field

### 3.1 List page — `/finance/bill/payments`

New page. `<DataTable>` shape lifted from the invoices/bill-runs list pages (URL-param pagination, filter bar). Columns: receipt number, student (name + admission no.), method, amount, status badge (§4), date. Filter bar: student search (debounced, matching `generate-invoice-dialog.tsx`), method `<Select>`, status `<Select>`, date range (native `type="date"` pair, matching the invoices list's existing due-date-range filter). Row actions (dropdown, matching the invoices list's `MoreHorizontal` menu):
- **View** → payment-detail modal (§3.3).
- **Mark Cleared / Mark Bounced** — only on `PENDING` rows, only for CHEQUE method (the one method with a real PENDING state per B5-5). `<ConfirmDialog>` with an optional reason field, `PATCH .../cheque-status`.
- **Void** — OWNER_ONLY (client-gated same as UI-1's precedent, backend 403 is the real gate), hidden on already-VOIDED rows. `<ConfirmDialog>` with an optional reason field, wording naming the reversal is permanent (mirrors UI-3's Post-confirmation weight — a void here also touches the ledger).

"Record Payment" action button (top of page, matching every other list page's create action) → routes to §3.2.

### 3.2 Record Payment — `/finance/bill/payments/new` (its own route, not a dialog)

One page, progressive disclosure rather than a wizard (consistent with UI-3's single-page ruling) — later fields simply don't render until the student is picked, since the data genuinely doesn't exist before then; there's no "Next" button, no step indicator.

1. **Student** — the `generate-invoice-dialog.tsx` search-dropdown pattern, direct lift.
2. **Once picked** — two read-only context panels fetch and render: this student's outstanding invoices (`GET bill/invoices?studentId=&status=POSTED,PARTIALLY_PAID`, now carrying `balance` per §2) and their current advance balance (`GET students/:id/balance`, negative = credit). Both inform the cashier before they type an amount — this is the whole reason §2 exists.
3. **Amount** (money input) and **Method** — `<Select>`. Ruled `CASH\|CHEQUE\|BANK_TRANSFER`, but **built as `CASH\|CHEQUE` only** — `BANK_TRANSFER` turned out to not exist yet at all: `BillPaymentService.recordPayment` 400s it live ("Checkpoint B records CASH and CHEQUE payments only"), a real gap this spec missed (the DTO enum lists it, the service doesn't implement it) and only found during Checkpoint A's own proof. Logged as `BILL-5-METHOD-GAP` in `BILL-BUGS.md`. ESEWA/KHALTI stay excluded for the reason originally ruled: a gateway payment is only legitimate carrying a real verified transaction reference from the actual gateway flow — a cashier hand-typing "eSewa" with no reference would be an unverified claim, not a recorded gateway payment. Enforced client-side only, in `bill-payment-form.ts` (§6) — nothing backend-side rejects an ESEWA/BANK_TRANSFER-shaped manual entry via the DTO alone.
4. **Allocation mode** — three-way toggle (mirrors the toggle-tab bar from `bulk-assign-dialog.tsx`/UI-3's create dialog): **AUTO_FIFO** (default — just informational text, "settles the oldest outstanding invoices first, no picking needed"), **MANUAL** (visible/enabled only for `OWNER_PRINCIPAL`-tier viewers per §1 — an ACCOUNTANT sees AUTO_FIFO/ADVANCE_ONLY only, matching the backend's own 403 boundary rather than showing a control that would just fail), **ADVANCE_ONLY** (no invoice picker — the whole amount becomes credit).
   - **MANUAL's picker**: the outstanding-invoices panel from step 2 becomes interactive — checkbox per invoice + a per-invoice amount input (defaulting to that invoice's own `balance`, editable down). Running-total-vs-`amount` validation client-mirrors the DTO's own rule (sum of targets ≤ amount) — real-time, not just on submit.
5. **CHEQUE-conditional fields** — `chequeBank`, `chequeDate` (`<BsDateInput>`, matching the BS-first convention UI-3's create dialog already established — not `payment-form.tsx`'s native `type="date"`, since that was old-rail and this is new-rail), plus `reference` (cheque number) reusing `payment-form.tsx`'s exact conditional-required-on-non-cash pattern.
6. **Received date** (`<BsDateInput>`, optional, defaults today) and **Notes** (optional textarea).
7. **Submit** → `POST bill/payments` → the response already has everything (§1) to render a receipt-result panel inline (mirrors `generate-invoice-dialog.tsx`'s own bulk-result "done" panel shape): receipt number, amount, allocations breakdown (which invoices got how much, any advance-credit remainder), a "Record Another" and a "Done → back to list" action.

### 3.3 Payment detail — modal, not a page

`invoice-detail-modal.tsx`-shaped: a single record's fixed, bounded field set (everything already on `BillPaymentResponseDto`, §1 — no second call needed) plus its allocations list (invoice number + amount each). Opened from the list's "View" action.

---

## 4. New status badge

`components/finance/bill-payment-status-badge.tsx`, same shape as `invoice-status-badge.tsx`/UI-3's `bill-run-outcome-badge.tsx` (own `styles`/`labels` maps): `CLEARED` (green), `PENDING` (amber — a promise, not money yet, per B5-5's own framing), `BOUNCED` (red), `VOIDED` (gray/neutral, same "administrative, not an error" treatment UI-3 gave `EXCLUDED`).

---

## 5. Nav + route-access

New sidebar sub-item under "Billing": `{ name: 'Payments', path: '/finance/bill/payments' }`. New `ROUTE_ACCESS` row: `{ prefix: '/finance/bill/payments', roles: ACCOUNTANT_AND_ABOVE, endpoint: 'POST /finance/bill/payments' }` — same tier as the other three Billing rows, citing `BillPaymentController`'s own base guard (MANUAL's narrower PRINCIPAL-tier gate is enforced in-page per §3.2, not at the route level, exactly like UI-2's OWNER_ONLY delete buttons).

---

## 6. Files

**Backend:**
- Modified: `bill-invoice.service.ts` (§2 JOIN + query), `entities/bill-invoice.entity.ts` (fields + mapper).
- Modified: `__tests__/bill-invoice.service.spec.ts` (§2 test).

**Web:**
- `app/(school)/finance/bill/payments/page.tsx` — list (§3.1).
- `app/(school)/finance/bill/payments/new/page.tsx` — record payment (§3.2).
- `components/finance/payment-detail-modal.tsx` — (§3.3).
- `components/finance/bill-payment-status-badge.tsx` — (§4).
- `lib/api/bill-payment.api.ts` — axios wrappers (record/list/detail/cheque-status/void).
- `lib/hooks/use-bill-payment.ts` — TanStack Query hooks, same shape as `use-bill-run.ts`.
- `lib/bill-payment-form.ts` — pure functions: MANUAL-targets-sum-≤-amount validation, method-list restriction (§3.2), tested standalone (mirrors UI-3's `bill-run-form.ts`/`canSubmitBillRunDraft` precedent).
- `types/api.types.ts` — `BillPayment`, `BillPaymentAllocation`, `CreateBillPaymentData` types ported from the backend entity/DTO (§1), plus `paidAmount`/`balance` added to the existing `BillInvoice`/`BillInvoiceLine`-equivalent types from UI-3 if any exist, else newly added here (UI-3 never needed invoice-level types, only run-line types — confirm at build time).

**Modified (web):** `components/layout/sidebar.tsx`, `lib/route-access.ts` (§5).

---

## 7. Proof approach — and where I'll want your eyeball

**Tier 1 — component/hook tests:** `bill-payment-form.ts`'s pure functions (MANUAL sum-≤-amount validation, including the boundary case; method-list restriction); `BillPaymentStatusBadge` (4 states, matching UI-3's per-outcome test shape); the MANUAL-mode role-gate itself (`role: 'ACCOUNTANT'` → toggle option absent/disabled, `role: 'PRINCIPAL'` → present) — same real-test-not-just-description discipline UI-3's role-gate test used.

**Tier 2 — real calls against the running dev backend, read back with raw `SELECT`:** record a CASH payment AUTO_FIFO across two unpaid invoices (oldest settles first); a MANUAL allocation targeting the newer invoice over the older one; an ADVANCE_ONLY deposit; a CHEQUE payment through PENDING → CLEARED (balance drops only at CLEARED, matching B5-5) and a separate one → BOUNCED-from-PENDING (balance never moved); a void with clean ledger reversal. This is close to verbatim `BILL-5-SPEC.md` §6's own test list, reused here for the UI path instead of a raw HTTP call — same acceptance bar BILL-5's own backend checkpoints already cleared once.

**Tier 3 — manual eyeball, flagging two points specifically:**
1. **The allocation-mode UI in Record Payment (§3.2).** Does AUTO_FIFO's "nothing to do" state read as reassuring rather than empty; does MANUAL's running-total-vs-amount validation feel immediate and clear (provoke it over-allocated on purpose); does an ACCOUNTANT login correctly never see MANUAL as an option at all (not just disabled-and-explained — genuinely absent, matching the "mirror the backend guard, don't just describe it" discipline).
2. **The receipt-result panel after a real submit.** Does it read as a trustworthy confirmation of where the money actually went (allocations breakdown legible at a glance), and does the cheque-conditional field set feel natural to fill in without the amount/method fields above it needing to be re-scanned.

No standing Playwright dependency in this repo (confirmed at UI-1) — tier 3 is a real click-through.

---

## Summary

| Question | Answer |
|---|---|
| New backend work | `paidAmount`/`balance` on `bill-invoice.service.ts`'s list + detail queries (§2) — same JOIN pattern already proven three times elsewhere, one more local copy (not shared, §0) |
| Web surface | Two new routes (`/finance/bill/payments` list, `/finance/bill/payments/new` record) + a detail modal — not a dialog, given the real size of the record-payment form |
| Cashier daily-close UI | Explicitly out of scope, explicitly not decided which phase it belongs to (§0) |
| ESEWA/KHALTI at the counter | Flagged default: excluded from the manual method list (§3.2) — say the word if you want them offered |
| MANUAL allocation gating | PRINCIPAL_AND_ABOVE, mirrored client-side via the verified `useAuthStore` role-check pattern (not `route-access.ts`, which is route- not element-scoped) |
| Old-rail payment form | Untouched |
| Eyeball points | (1) Allocation-mode UI — AUTO_FIFO/MANUAL/ADVANCE_ONLY clarity, role-gate correctness; (2) the post-submit receipt-result panel |
