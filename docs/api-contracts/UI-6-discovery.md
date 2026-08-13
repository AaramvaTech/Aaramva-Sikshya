# UI-6 — Reports: Discovery Report

**Status:** Discovery only. No code touched, no branch created. Sixth of seven Billing-rail phases
(Catalog ✓ → Assignment ✓ → Bill Runs ✓ → Payment Counter ✓ → Corrections ✓ → **Reports** → Settings).

**Scope, per the two explicit deferral notes already on record:**
- `UI-2-SPEC.md` §"Doesn't" (line 17): the concession register was ruled out of Assignment —
  "it's a report by nature and belongs with the other reports, not scattered into this phase.
  Logged here as **UI-6 scope**, not built."
- `UI-4-CHECKPOINT-A-SPEC.md` line 20 (`UI-6-SCOPE-CASHIER-UI` in `BILL-BUGS.md`): cashier
  daily-close was ruled out of Payment Counter — "daily-close is reconciliation (audit/report),
  not payment-recording, and belongs with UI-6 Reports alongside BILL-9's other reporting
  endpoints." **This is a standing ruling, not an open question** — it settles §3 below in favor
  of grouping cashier with the reports, not folding it into the existing Payments page.

**Method:** every controller/service/DTO read directly, not assumed from `BILL-9-SPEC.md` alone
(the spec's own routes drifted at build time — see the `BILL-9-CKPTA-DEVIATION-1` precedent below).
Both existing report-shaped web pages (`app/(school)/reports/page.tsx`,
`app/(school)/finance/reports/page.tsx`) read in full. Current `route-access.ts` and
`sidebar.tsx` Billing-rail entries checked directly.

---

## 1. Backend surface

**Correction to the premise, checked not assumed:** there is no single `reports.controller.ts`
under `finance/`. Four of the six report endpoints (daybook, defaulters, aging, collection) are
mounted on the pre-existing REP-1 `ReportsController` (`apps/api/src/modules/reports/
reports.controller.ts`, prefix `reports`), a deliberate deviation logged as
`BILL-9-CKPTA-DEVIATION-1`: `finance/reports/collection` and `finance/reports/defaulters` were
already live on `FinanceController` (old rail, `report.service.ts`, still backing
`finance/reports/page.tsx`), so BILL-9 mounted its new-rail equivalents under `/reports/finance/*`
instead of colliding. Fines (BILL-7) followed the same precedent. Student statement and cashier
stayed on their own finance-module controllers.

| Report | Route | Query params | Roles | Response shape (top level) |
|---|---|---|---|---|
| **Daybook** | `GET /reports/finance/daybook` | `bsDate?` (BS `YYYY-MM-DD`, defaults today) | `FINANCE_REPORT_ROLES` | `{ bsDate, adDate, entries[], byMethod[], totals: { totalInvoiced, totalCollected, totalRefunded, netMovement } }` |
| **Defaulters** | `GET /reports/finance/defaulters` | `classId?`, `minBalance?`, `sort?` (`balance｜class｜oldest`, whitelisted) | `FINANCE_REPORT_ROLES` | `{ asOf, totalDefaulters, totalOutstanding, students[] }` |
| **Aging** | `GET /reports/finance/aging` | `asOf?` (AD date), `classId?` | `FINANCE_REPORT_ROLES` | `{ asOf, buckets[4], totalOutstanding, byClass[], invoices[] }` — **already consumed live** by `app/(school)/reports/page.tsx`'s Fees tab; BILL-9 only re-sourced it to the new `bill_invoices` rail, response shape untouched |
| **Collection** | `GET /reports/finance/collection` | `from?`, `to?` (AD, `resolveRange` default = current BS-year start → today, 2yr cap), `groupBy?` (`method｜feehead`) | `FINANCE_REPORT_ROLES` | `{ range, groupBy, totalCollected, breakdown[] }` |
| **Fines** (BILL-7) | `GET /reports/finance/fines` | `from?`, `to?`, `classId?` | `FINANCE_REPORT_ROLES` | `{ range, count, totalFined, accruals[] }` |
| **Student statement** | `GET /finance/students/:studentId/statement` | `from?`, `to?` (AD) | `ACCOUNTANT_AND_ABOVE` + `PARENT` (object-scoped via `assertGuardianOwnsStudent`) | `{ student, range, openingBalance, closingBalance, advanceCredit, totalDebit, totalCredit, entries[] }` — entries carry a SQL window-function `runningBalance` |
| **Concession register** | `GET /finance/reports/concession-register` | `page?`, `limit?` (default 20), `academicYearId?`, `classId?`, `discountReasonId?` | `ACCOUNTANT_AND_ABOVE` | `{ data[], meta: { page, limit, total } }` — paginated, unlike the other five |
| **Cashier — open shift** | `POST /finance/cashier/shifts/open` | body: `{ academicYearId, openingFloat, notes? }` | `ACCOUNTANT_AND_ABOVE` | shift row; 409 if the caller already has an OPEN shift |
| **Cashier — close shift** | `POST /finance/cashier/shifts/:id/close` | body: `{ countedCash, notes? }` | `ACCOUNTANT_AND_ABOVE`, soft-scoped (any caller may close any OPEN shift, accountability via `closed_by`) | `{ shift, openingFloat, countedCash, expectedCash, variance, cashCollected, chequeTotal, gatewayTotal, byMethod[] }` |
| **Cashier — list shifts** | `GET /finance/cashier/shifts` | `cashierId?`, `date?` (AD) | `ACCOUNTANT_AND_ABOVE` | flat array of shift rows, **not paginated** |

`FINANCE_REPORT_ROLES` = `PLATFORM_ADMIN, SCHOOL_OWNER, PRINCIPAL, ACADEMIC_COORDINATOR,
ACCOUNTANT` (identical set across daybook/defaulters/aging/collection/fines).
`ACCOUNTANT_AND_ABOVE` (concession register, statement, cashier) is the same five roles, named
under a different constant per file.

**Money and date conventions, consistent across all seven:** every total is a SQL
`SUM`/window-function aggregate (`toMoney(...).toNumber()`), never a JS `reduce` — B9-6's own
stated rule, worth keeping the frontend from re-deriving anything it can just display. Date
ranges default via `resolveRange` (current BS year start → today, capped at ~2 years) except
daybook (single BS day, defaults today) and aging (single `asOf` AD date, defaults today).
"Collected" means `status = 'CLEARED'` throughout — a PENDING cheque never counts, in the
collection report, the daybook, or the cashier close.

---

## 2. Existing report/dashboard patterns to reuse

**Two tabbed report pages already exist; one is the clear template, the other is a fallback
reference for the one per-student-search UX this phase also needs.**

**`app/(school)/reports/page.tsx` (REP-1) — the template.** Read in full. Radix `<Tabs>`, a local
`Card` wrapper (`rounded-sm border ... shadow-default`), a local `SimpleTable` (plain `<table>`,
"No data in this range" empty state), a `CsvButton` wired to `exportToCsv` from `lib/export.ts`
per-card, `<BsDateInput>`/`<BsDate>` for every date field, `recharts` `<BarChart>` for the two
places a chart earns its place (attendance trend, exam grade distribution — the finance reports
below are tables/stat-cards only, no chart need identified), `<QueryErrorState onRetry={refetch}>`
on every `isError`, `<Skeleton>` while loading. Role-aware tab visibility already has a precedent
for exactly this problem: `accountantOnly` hides two tabs and defaults the third
(`app/(school)/reports/page.tsx:459-478`) — the same shape UI-6 needs if any tab should be hidden
per role (none currently identified; all seven new views share one role set).

**`app/(school)/finance/reports/page.tsx` (old rail) — the per-student-search precedent.** Its
`LedgerTab` (debounced search input → dropdown of matches → selected student's full ledger,
collapsible invoice rows) is exactly the UX the new **Student Statement** view needs, since
`GET .../statement` also takes a single `studentId`, not a filterable list. Copy this
search-then-render shape rather than the org-wide filter-bar shape the other six views use.

**Nothing else to build from scratch:** `PageHeader`, `DataTable`, `QueryErrorState`, `Skeleton`,
`BsDate`/`BsDateInput`, `exportToCsv`, the `Select`/`SelectTrigger` async-data pattern — all
already proven in these two pages and the rest of the Billing rail.

---

## 3. Cashier daily-close — settled, not an open question

The placement question the user posed is already answered by standing ruling
(`UI-4-CHECKPOINT-A-SPEC.md` line 20, quoted in the header above): cashier open/close is
reconciliation, grouped with Reports, not folded into the existing `/finance/bill/payments` page.

**Proposed concretely:** one more tab ("Cashier") on the same new tabbed Reports page, not a
seventh top-level Billing nav entry. Contents: an open-shift form when the caller has no OPEN
shift (`academicYearId`, `openingFloat`, `notes`) or a close-shift form when they do
(`countedCash`, `notes`, showing the live `expectedCash`/`variance` the close response returns),
plus a shift-history table below it (`GET shifts`, filterable by date). This is the one
**write** path in an otherwise read-only phase — same "small write folded into a read-heavy page"
shape UI-3 already used for bill-run exclude/post actions living alongside the run's read-only
line table.

**Reasoning against a standalone `/finance/bill/cashier` page:** it's a small surface (one
open/close form + one list, no filters beyond date/cashier) and the daybook tab right next to it
is the natural cross-check for "does today's collection total match what I'm about to close" —
keeping them one tab apart costs nothing and matches the Fee-Catalog / HR-Setup precedent of
clustering small related surfaces under one tabbed page rather than growing the nav.

---

## 4. Proposed screen breakdown

**One new page, `/finance/bill/reports`, tabbed — not per-report routes.** Consistent with the
Fee Catalog's seven-tab precedent (`hr/setup/page.tsx` origin, cited in
`BILL-ADMIN-UI-discovery.md` §1) and with REP-1's own three-tab shape.

| Tab | Backend call | UX shape |
|---|---|---|
| Daybook | `GET /reports/finance/daybook` | BS-date picker (single day) + stat row (invoiced/collected/refunded/net) + by-method breakdown + entries table |
| Defaulters | `GET /reports/finance/defaulters` | class filter + min-balance input + sort select + stat row + table (same shape as the existing old-rail Defaulters tab, re-pointed at the new-rail endpoint and its richer sort options) |
| Aging | `GET /reports/finance/aging` | **Reuse, don't rebuild** — same endpoint the existing `/reports` Fees tab already calls. See open question below. |
| Collection | `GET /reports/finance/collection` | date-range picker + groupBy toggle (method/fee-head) + stat + breakdown table |
| Fines | `GET /reports/finance/fines` | date-range picker + class filter + stat row + accruals table (reversed rows visibly flagged, not hidden) |
| Concession register | `GET /finance/reports/concession-register` | filter bar (academic year / class / discount reason) + paginated table — the one tab needing real pagination controls, not just a CSV-all-rows table |
| Student statement | `GET /finance/students/:studentId/statement` | search-then-render, copied from the old-rail `LedgerTab` shape (§2) |
| Cashier | open/close endpoints + `GET shifts` | form + history table, per §3 |

**Open question for Srijan's ruling, not decided here:** Aging already has a live home at
`/reports` (Fees tab, ACCOUNTANT-visible) reading the exact same endpoint this phase would also
tab in. Three options: (a) duplicate it as a tab here too (cheap — same hook, same component,
zero new backend calls, accountants working the Billing rail don't have to leave it), (b) omit it
here and cross-link to `/reports` the way the old-rail aging tab already links to defaulters
("Who owes overall lives in the defaulters report"), or (c) leave `/reports`'s Fees tab as-is and
treat it as aging's one home, with Billing Reports covering the other six. No functional
difference either way since both read the same endpoint — purely a "how many places show the same
number" call.

---

## 5. Backend gaps

Two real ones, both the same shape as findings from every prior phase (UI-5's
`UI5-STUDENTNAME-JOIN`): raw UUIDs where a screen needs a name.

1. **Cashier shift rows carry no name.** `CashierShiftResponseDto.cashierUserId` /`.closedBy` are
   bare UUIDs (`entities/cashier-shift.entity.ts` — confirmed, no JOIN anywhere in
   `cashier-shift.service.ts`'s `openShift`/`closeShift`/`listShifts` queries). The Cashier tab's
   shift-history table and the "who's shift is this" moment on close both need a display name.
   Fix is a one-line `JOIN users` + two extra SELECT columns in `listShifts`/`closeShift`,
   mirroring the concession register's own `applied_by_first_name`/`applied_by_last_name` pattern
   in the same module (`concession-register-report.service.ts:81` already does this correctly —
   cashier just didn't).
2. **No way to drill from a closed shift into the payments that composed it.**
   `BillPaymentQueryDto` (`dto/bill-payment.dto.ts:66-74`) filters by `studentId`/`method`/
   `status`/`dateFrom`/`dateTo` only — no `receivedBy`/cashier filter, and the shift itself
   persists only aggregates (`byMethod`, totals), never the individual `bill_payments` rows.
   If a cashier's counted cash doesn't match `expectedCash`, there's no path from the UI to the
   actual list of payments that sum to that variance. Smallest fix: add an optional `receivedBy`
   query param to the existing payments list endpoint (no schema change) rather than persisting a
   `shift_id` FK on `bill_payments` (bigger change, not needed for a read-only drill-down).

**Minor, not blocking:** `GET /finance/cashier/shifts` returns a flat unpaginated array — every
other list endpoint in this module paginates; fine at today's data volume, will not stay fine
indefinitely. `student_ledger_entries.created_by` (surfaced in the statement tab's entries) is
also a bare UUID, same pattern as #1 but lower priority — a statement's reader cares about the
transaction's narration/reference, not who keyed it in, so this one's optional.

---

## Summary

| Question | Answer |
|---|---|
| Backend surface | 6 report endpoints (2 controllers) + 3 cashier endpoints + concession register — all read directly, routes/params/roles/shapes tabulated in §1 |
| Existing patterns | `/reports` (REP-1) is the direct template (tabs/Card/SimpleTable/CsvButton/BsDateInput/QueryErrorState); old-rail `/finance/reports`'s `LedgerTab` is the template for the one per-student-search view (Statement) |
| Cashier placement | **Already ruled** (`UI-4-CHECKPOINT-A-SPEC.md`): groups with Reports as reconciliation, not with Payments. Proposed as one more tab, not a new nav entry. |
| Screen breakdown | One page, `/finance/bill/reports`, 8 tabs (Daybook, Defaulters, Aging, Collection, Fines, Concession Register, Student Statement, Cashier) — Aging's exact placement is one open question (§4) |
| Backend gaps | Cashier shift rows need a name JOIN (real, same shape as `UI5-STUDENTNAME-JOIN`); payments list needs an optional `receivedBy` filter for shift drill-down; shift list is unpaginated (minor) |
