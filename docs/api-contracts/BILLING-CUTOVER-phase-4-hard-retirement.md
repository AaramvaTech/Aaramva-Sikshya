# BILLING-CUTOVER Phase 4 — Hard retirement of old Finance

**Status:** Done. Old Finance's backend routes/services, DB tables, and frontend pages are gone.
This closes BILLING-CUTOVER. Irreversible step, done with explicit go-ahead; a full `pg_dump`
backup was taken immediately before the DB migration (`backups/aaramva-20260814-230913.dump`).

## Dependency check (run before any deletion, per the discovery doc)

Exhaustive grep across the whole backend and frontend (admin/parent/teacher portals, plus a
sanity pass on mobile), and a full FK audit of the tenant schema. Findings below — some were
"safe to delete," several were real, live code paths that would have broken and needed fixing
first.

### Backend — safe to delete (confirmed old-Finance-exclusive)

`FinanceController`'s constructor is the ground truth for what old Finance's HTTP surface
actually depends on: exactly `FeeCategoryService`, `FeeStructureService`, `InvoiceService`,
`PaymentService`, `ReportService`. Grepped each class name (word-boundaried, not filename
pattern — filename patterns lied at least once, see below) for every other consumer: none
found beyond `finance.module.ts`, `finance.controller.ts`, their own spec files, and
`jobs/recalculate-fines.job.ts` (`InvoiceService`, the old-rail-only fine cron).

**Filename patterns are not reliable evidence.** `late-fee-rule.service.ts` has no `bill-`
prefix and looks old-rail by name, but it's injected by `bill-catalog.controller.ts` — a live
Billing-rail service (`late_fee_rules` is read by both the old CRUD and BILL-7's
`bill-fine.service.ts`). Every deletion decision in this phase was made by tracing actual
`@Controller`/constructor wiring, never by filename.

**`entities/finance.entity.ts` was NOT deleted — surgically edited.** Its `Row`/`ResponseDto`
types and mapper functions (`FeeCategoryRow`, `InvoiceResponseDto`, `toInvoiceResponse`, …) were
old-rail-exclusive and removed. But `toMoney`/`toAdString` are imported by nearly every
Billing-rail service (`bill-payment`, `bill-invoice`, `bill-correction`, `bill-fine`, `ledger`,
`cashier-shift`, `fee-preview`, `opening-balance-import`, `esewa`, `khalti`, …) and by the REP-1
reports module — deleting the file wholesale would have broken the entire Billing rail's build.
The file's historical name now undersells its real (shared-utility) role but was left in place
rather than renamed, to avoid an unrelated ~20-file import-path sweep.

### Backend — found live, fixed as part of this phase (not part of "old Finance" itself)

- **`dashboard.service.ts`** — the school-wide dashboard's fee-collection stat and
  recent-activity feed read raw SQL straight off `invoices`/`payments`. Rewired to
  `bill_invoices`/`bill_payment_allocations`/`bill_payments` (CLEARED-only for "collected"),
  live-verified before AND after the table drop (`totalInvoiced` Rs 55,580, `totalCollected`
  Rs 23,760 — Postgres-confirmed exact match both times).
- **`prisma/seed-test-school.ts`** and **`seed-motherland.ts`** — both `INSERT`ed into
  `fee_categories`/`fee_structures`/`invoices`/`invoice_items`/`payments`. Those blocks are
  removed (with their now-dead helper constants/functions); both scripts still run, they just
  no longer seed old-Finance data. A comment points at the real admin UI for fee/billing dev
  data instead.
- **`payment_transactions.invoice_id`/`payment_id`** — PAY-1-era columns (0005), made optional
  by 0026 once eSewa/Khalti moved to `bill_invoice_id`/`bill_payment_id` (BILL-5 Checkpoint C).
  5 rows total, fleet-wide (4 in `demo`, 1 in `motherland-school`) still had `invoice_id` set —
  all dead 2026-07 PAY-1 test transactions (`INITIATED`/`EXPIRED`, confirmed live before
  touching anything). Both columns dropped in the same migration as the table drops (their FK
  and the `chk_payment_transactions_one_invoice_kind` CHECK constraint go with them) — this is
  the one place this phase caused real, if inconsequential, data loss: those 5 rows lose their
  legacy invoice back-reference. The rows themselves, and every other column, are untouched.

### Frontend — found live, fixed as part of this phase

- **`app/(school)/students/[id]/page.tsx`** (admin student profile) — `OverviewStats`'s "Fees
  Paid"/"Outstanding Balance" cards used `useStudentLedger` (old rail). Rewired to
  `useStudentBalance` + `useStudentBillInvoices`/`sumInvoiceTotals`, same split Phase 1
  established. Bigger find: the page had an entire **redundant tab**, "Fees" (`FeesTab` +
  `AssignmentRow`, a full per-student fee-structure-item override editor against old Finance's
  `student_fee_assignments`), living alongside the already-correct "Billing" tab
  (`StudentBillingTab`, confirmed fully built and correctly wired back in the original
  BILL-STUDENT-PROFILE-BUG investigation that opened this whole cutover). Both tabs were
  reachable by the same role tier (`BILLING_TAB_ROLES` = `ACCOUNTANT_AND_ABOVE` minus
  `PLATFORM_ADMIN`; old rail's route required the same tier), so removing "Fees" loses no admin
  capability — "Billing" already covers assignment/overrides/concessions/transport/preview.
  Removed the tab, its two functions, the "View Fees" quick-action button retargeted to the
  Billing tab (now gated the same way the tab itself is), and every import that only that dead
  code used (`Select`/`SelectContent`/`SelectItem`/`SelectTrigger`, `Checkbox`, `Label`, `Input`,
  the `X` icon, `useAcademicYears`, `FeeAssignment` type).
- **`app/(portal)/parent/page.tsx`** (parent dashboard — not `/parent/fees`, which Phase 1
  already covered) — `ChildOverviewCard`'s "Fee Balance" widget and the child-comparison table's
  "Fee Balance" row both used `useStudentLedger`. Rewired to `useStudentBalance` (simpler than
  the invoice-list approach — these only ever needed a single balance number, never a per-invoice
  breakdown), which also meant `ComparisonFeeCell` no longer needs an `academicYearId` prop at
  all (Billing's balance is a whole-account figure, not year-scoped).

Both fixes reuse hooks Phase 1/the dashboard fix already built — no new backend code, no new
frontend hooks.

### Confirmed clean, deliberately untouched

- **Mobile app** — already migrated off old Finance via a prior, separate effort
  (`PAY-UI-REPOINT`, closed before this cutover started); the only matches were historical code
  comments naming the old route, not live calls.
- **Teacher portal** — Phase 2 already confirmed zero exposure; re-confirmed no teacher-facing
  file references anything in this phase's deletion list.
- **REP-1 `modules/reports/*`** — a separate module from old Finance's own
  `modules/finance/report.service.ts`; only shares `toMoney` (kept).
- **`tenant-schema.sql` / `TenantService.provisionSchema()`** — contains old-Finance
  `CREATE TABLE` statements but has zero callers anywhere in the codebase (confirmed by
  grep — provisioning has run through the migration-runner's `0001_baseline.sql` since MIG-1,
  per CLAUDE.md). Genuinely dead code, predates this cutover, out of scope here — left alone.
- **`tenant_bill_scratch`** — an untracked Postgres schema with old-Finance-shaped tables,
  found while confirming the drop fleet-wide. It has no row in `public.tenants` — not a real
  tenant, invisible to (and correctly never touched by) the migration runner. Unrelated scratch
  state from an earlier session; not part of the tracked fleet, left alone.

## What was deleted

**Backend:** `finance.controller.ts`; `fee-category.service.ts`, `fee-structure.service.ts`,
`invoice.service.ts`, `payment.service.ts`, `report.service.ts` + their DTOs
(`dto/fee-category.dto.ts`, `dto/fee-structure.dto.ts`, `dto/invoice.dto.ts`,
`dto/payment.dto.ts`) and specs; `jobs/recalculate-fines.job.ts` + spec (and its
`POST /super-admin/jobs/recalculate-fines` route/injection in `jobs.controller.ts`).
`finance.module.ts`/`jobs.module.ts` updated to match.

**Database** (`0031_drop_old_finance_tables.sql`, canaried on `demo` then rolled to all 8
tenants): `fee_categories`, `fee_structures`, `fee_structure_items`, `student_fee_assignments`,
`invoices`, `invoice_items`, `payments` — plus `payment_transactions.invoice_id`/`payment_id`.

**Frontend:** `app/(school)/finance/page.tsx`, `finance/invoices/`, `finance/fee-structures/`,
`finance/reports/` (the `finance/bill/*` tree is untouched — it's the entire Billing admin UI);
`components/finance/invoice-detail-modal.tsx`, `generate-invoice-dialog.tsx`,
`fee-structure-form.tsx`, `payment-form.tsx`, `invoice-status-badge.tsx`;
`lib/hooks/use-finance.ts`, `lib/api/finance.api.ts`; 20 old-rail types from `types/api.types.ts`
(`FeeCategory`, `FeeStructureItem`, `FeeStructureSummary`, `FeeStructureDetail`,
`FeeAssignment`, `InvoiceSummary`, `InvoiceItem`, `Payment`, `InvoiceDetail`, `CollectionReport`,
`DefaulterStudent`, `StudentLedger`, `DefaulterReport`, and the six Finance DTOs).

## Verification

**Live 404s** (as `owner@demo.school`, shimmed/verified/401-restored): 8 old routes probed —
`GET /finance/fee-structures`, `/fee-categories`, `/invoices`, `/reports/student/:id`,
`/reports/defaulters`, `/students/:id/assignments`, `POST /finance/payments`,
`POST /super-admin/jobs/recalculate-fines` — **all 404**, none 500, none silently succeeded.

**Postgres** confirms the drop fleet-wide: `count(*) = 0` for the 7 dropped table names across
all 8 real tenant schemas; `count(*) = 0` for `payment_transactions.invoice_id`/`payment_id`
across the same 8. (`tenant_bill_scratch` still has them — expected, out of scope, see above.)

**Full suites, both apps:** `nest build` clean, **1112/1112 api tests** passing (was 1093 at
BILL-6, grown through subsequent BILL-7/8/9/UI work; old-rail spec deletions netted out against
that growth). Web `tsc --noEmit` clean, **531/531 web vitest** passing (unchanged through this
phase — pure deletions/rewires, no new logic needing new tests beyond what Phase 1 already
added).

**Billing end-to-end, re-proved after the drop** (not just trusted from the canary step): as
`owner@demo.school` — dashboard fee-collection (`totalInvoiced` 55580/`totalCollected` 23760,
Postgres-matched), dashboard recent-payments (5 real rows), student bill-invoices (2), student
balance (`2260 OWES`), fee catalog (1 structure). As `parent@demo.school` — same child's
invoices (2) and balance (2260), plus a cross-family probe on a different student → 403,
confirming object-scoping survived the migration untouched.

## Closing BILLING-CUTOVER

Phase 0 (data hygiene) → Phase 1 (parent audit + rewire, two commits) → Phase 2 (teacher audit,
zero exposure confirmed) → Phase 3 (nav retirement) → Phase 4 (this phase) — old Finance is now
fully gone: no nav path to it, no route that serves it, no table that stores it. Billing is the
only fee/invoice/payment rail left, for every role that has one.
