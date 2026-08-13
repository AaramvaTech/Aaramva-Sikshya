# UI-6-SPEC — Reports (+ Cashier daily-close + Concession register)

**Target path in repo:** `docs/api-contracts/UI-6-SPEC.md`
**Branch (not yet created):** `feat/ui-6-reports`
**Depends on:** UI-1 (merged — discount reasons already exist, consumed read-only by the
Concession Register tab), UI-4 (merged — `bill-payment.api.ts` already wraps
`GET students/:id/balance`, extended here with `getStatement`), REP-1 (merged — `/reports` page
and its `useFeeAging` hook are reused verbatim, not rebuilt), BILL-9 (backend, merged — every
report/cashier/concession-register endpoint already live).
**Covers:** the BILL-9 report suite (daybook, defaulters, aging, collection, student statement)
plus two items parked here by standing ruling from earlier phases: cashier daily-close
(`UI-4-CHECKPOINT-A-SPEC.md` line 20 — "belongs with UI-6 Reports") and the concession register
(`UI-2-SPEC.md` line 17 — "it's a report by nature"). Sixth of seven phases
(Catalog ✓ → Assignment ✓ → Bill Runs ✓ → Payment Counter ✓ → Corrections ✓ → **Reports** →
Settings).
**Status:** Spec only. Not built. Discovery (`UI-6-discovery.md`) approved with three rulings
below; this spec turns them into concrete screens/files. Stop point: Srijan reviews before any
code is written.

**Rulings already locked in (from the discovery review):**
1. **Aging is duplicated, not cross-linked or single-homed.** It stays live at `/reports`'s Fees
   tab *and* gets its own tab on the new Billing Reports page, both reading the same
   `GET /reports/finance/aging` endpoint. Reason given: "the whole point of the Billing section
   has been standing on its own separate from the old rail since UI-1 — an owner shouldn't need
   to know the old rail exists to find all eight reports."
2. **Both backend gaps from discovery are approved — build both, this phase.** Cashier shift name
   join (`UI-6-discovery.md` §5.1) and a `receivedBy` filter on the payments list
   (`UI-6-discovery.md` §5.2). Same shape as UI-3/UI-5's own mid-build backend additions — see §2.
3. **Design flag, not a spec blocker — Srijan will eyeball this at build time.** The eight views
   split into two different kinds of screen: six are filterable listing reports (Daybook,
   Defaulters, Aging, Collection, Fines, Concession Register — discovery's message underscored
   this as "five"; the parenthetical list of six names plus the "all eight reports" total in
   ruling 1 both point at six, so six is what this spec builds against), while Student Statement
   is a single-student lookup and Cashier is an open/close workflow. The six listing reports stay
   one clean tab group; Statement and Cashier get visually distinct treatment — §4.2 proposes a
   concrete layout, confirmed only once it's actually on screen.

---

## 0. What this phase does and does not do

**Does:** ship one new page, `/finance/bill/reports`, covering all eight BILL-9 read surfaces
plus the one cashier write action, entirely against already-live endpoints except for two small,
now-approved backend additions (§2). Reuses REP-1's `/reports` page pattern wholesale — no new
UI primitives.

**Does not:**
- Touch `/reports` (REP-1) itself. Aging stays there too, unmodified — ruling 1 is additive, not
  a move.
- Build the credit-note threshold edit UI, invoice-numbering reset, or `printLanguage` field —
  all UI-7 (Settings) scope, untouched by this phase.
- Build a parent-facing view of any of these eight — every endpoint here is staff-only except
  student statement, which already supports `PARENT` object-scoped server-side but this phase
  ships the accountant-facing search-and-view screen only, same "admin-only for v1" precedent
  UI-5 ruling 4 set for corrections. A parent-facing statement view (if ever wanted) is a
  separate, future decision.
- Touch dark mode. Standing rule, confirmed every phase so far: `forcedTheme="light"`, light mode
  only.
- Decide final pixel-level styling for the tab-grouping split (ruling 3) — this spec documents
  the structural requirement (§4.2) and proposes one concrete layout; the visual read is Srijan's
  call once it's built.

---

## 1. Backend surface — confirmed by reading source, condensed from `UI-6-discovery.md` §1

| Report | Route | Query params | Roles |
|---|---|---|---|
| Daybook | `GET /reports/finance/daybook` | `bsDate?` (BS, defaults today) | `FINANCE_REPORT_ROLES` |
| Defaulters | `GET /reports/finance/defaulters` | `classId?`, `minBalance?`, `sort?` (`balance｜class｜oldest`) | `FINANCE_REPORT_ROLES` |
| Aging | `GET /reports/finance/aging` | `asOf?` (AD), `classId?` | `FINANCE_REPORT_ROLES` |
| Collection | `GET /reports/finance/collection` | `from?`, `to?` (AD), `groupBy?` (`method｜feehead`) | `FINANCE_REPORT_ROLES` |
| Fines | `GET /reports/finance/fines` | `from?`, `to?`, `classId?` | `FINANCE_REPORT_ROLES` |
| Concession register | `GET /finance/reports/concession-register` | `page?`, `limit?` (default 20), `academicYearId?`, `classId?`, `discountReasonId?` | `ACCOUNTANT_AND_ABOVE` |
| Student statement | `GET /finance/students/:studentId/statement` | `from?`, `to?` (AD) | `ACCOUNTANT_AND_ABOVE` + `PARENT` (object-scoped, unused by this phase's UI) |
| Cashier open | `POST /finance/cashier/shifts/open` | body `{ academicYearId, openingFloat, notes? }` | `ACCOUNTANT_AND_ABOVE` |
| Cashier close | `POST /finance/cashier/shifts/:id/close` | body `{ countedCash, notes? }` | `ACCOUNTANT_AND_ABOVE`, soft-scoped |
| Cashier list | `GET /finance/cashier/shifts` | `cashierId?`, `date?` (AD) | `ACCOUNTANT_AND_ABOVE` |

`FINANCE_REPORT_ROLES` and `ACCOUNTANT_AND_ABOVE` are the identical five roles
(`PLATFORM_ADMIN, SCHOOL_OWNER, PRINCIPAL, ACADEMIC_COORDINATOR, ACCOUNTANT`), named separately
per controller file — every one of these eight endpoints shares exactly one role set. One
`ROUTE_ACCESS` row covers the whole page (§5).

Full response-shape detail (fields, JOINs, SQL-aggregate conventions) is in `UI-6-discovery.md`
§1 — not repeated here since nothing about it changed between discovery and this spec.

---

## 2. The two backend additions this phase builds (ruling 2)

### 2.1 Cashier shift name join

`cashier-shift.service.ts`'s `openShift`/`closeShift`/`listShifts` currently `SELECT *` /
`RETURNING *` from `cashier_shifts` with no JOIN — `CashierShiftResponseDto.cashierUserId` and
`.closedBy` are bare UUIDs. Add a `JOIN users cu ON cu.id = cashier_user_id` (and a second join
or a `LEFT JOIN users cb ON cb.id = closed_by` for the close case) to all three queries, add
`cashierName`/`closedByName` (nullable — `closedByName` is null until closed) to
`CashierShiftRow`/`CashierShiftResponseDto` (`entities/cashier-shift.entity.ts`), map in
`toCashierShiftResponse`. Mirrors the concession register's own
`applied_by_first_name`/`applied_by_last_name` pattern already living in the same module
(`concession-register-report.service.ts:81`) — same fix shape as `UI5-STUDENTNAME-JOIN`.

- **Test:** new case in `cashier-shift.service.spec.ts` — open a shift, assert `cashierName`
  matches the seeded user's full name; close it, assert `closedByName` is populated post-close
  and null on the still-open row beforehand.

### 2.2 `receivedBy` filter on the payments list

`BillPaymentQueryDto` (`dto/bill-payment.dto.ts:66-74`) gets one new optional field:
`@IsOptional() @IsUUID() receivedBy?: string`. `bill-payment.service.ts`'s `findAll` WHERE clause
gets one more `AND ($n::uuid IS NULL OR received_by = $n::uuid)` condition, same pattern as every
other optional filter already in that query. No new endpoint, no schema change — purely additive,
existing callers (Payment Counter's list page) unaffected since the param is optional.

- **Test:** new case in `bill-payment.service.spec.ts` — two payments received by different
  users, `findAll({ receivedBy: userA })` returns only userA's row.

**Why this shape and not a `shift_id` FK on `bill_payments`:** the discovery doc considered
persisting a shift reference directly on each payment for an exact join, but a time-window query
(`received_by = X AND created_at BETWEEN shift.opened_at AND shift.closed_at`) — the same
approach `closeShift`'s own aggregation already uses — gives an identical drill-down result
without a migration. The Cashier tab's shift-detail view passes the shift's own `openedAt`/
`closedAt` and `cashierUserId` as `dateFrom`/`dateTo`/`receivedBy` to the existing payments list
call; no new query logic needed beyond §2.2's one filter.

---

## 3. Placement — nav + route-access

New sidebar sub-item under "Billing" (`sidebar.tsx`, after the existing Corrections row):
`{ name: 'Reports', path: '/finance/bill/reports' }`.

New `ROUTE_ACCESS` row (`route-access.ts`, same block as the other Billing rows, after
`/finance/bill/corrections`): `{ prefix: '/finance/bill/reports', roles: ACCOUNTANT_AND_ABOVE,
endpoint: 'GET /reports/finance/daybook' }` — one row covers all eight tabs since every endpoint
behind this page shares the identical five-role set (§1); no per-tab role branching is needed
inside the page (unlike REP-1's own `/reports`, which hides two tabs from `ACCOUNTANT`
specifically because *that* page mixes finance-only roles with academic-report roles — not a
problem here, since nothing on this page is academic).

---

## 4. The screen — `/finance/bill/reports`

### 4.1 Page shell

One `'use client'` page, `<PageHeader title="Reports" description="Billing rail reporting —
collections, defaulters, aging, and cashier reconciliation" />`, then the tab structure below.
Directly modeled on `app/(school)/reports/page.tsx` (REP-1): Radix `<Tabs>`, the same local
`Card`/`SimpleTable` wrapper components (copied, not imported — REP-1's are page-local, not
exported; if a third page ends up wanting them, extracting to `components/shared/` becomes
worthwhile then, not speculatively now), `CsvButton` → `exportToCsv`, `<BsDateInput>`/`<BsDate>`
for every date field, `<QueryErrorState onRetry={refetch}>`, `<Skeleton>` while loading.

### 4.2 Tab grouping (ruling 3)

**Proposed layout, to be confirmed on screen, not decided here:** two visually separated clusters
in the tab bar, both still inside one Radix `<Tabs>` root (so keyboard nav and the underlying
`value`/`onValueChange` stay a single state machine — no split into two independent tab
components):

```
[ Daybook | Defaulters | Aging | Collection | Fines | Concession Register ]  │  [ Statement ]  [ Cashier ]
                     ← six listing reports, TabsTrigger as usual →         divider    ← two workflow tabs →
```

Concretely: the existing `Separator` primitive (`components/ui/separator.tsx`, already in the
component inventory, `orientation="vertical"`) between the sixth and seventh `<TabsTrigger>`
inside one `<TabsList>`, with Statement/Cashier's two triggers given a subtly different visual
weight (e.g. an outline style vs. the listing group's filled-on-active style, or a small
uppercase "Tools" micro-label above just those two) so the eye reads three things — six reports,
a boundary, two actions — not eight identical buttons. Exact treatment (divider alone vs.
divider-plus-label vs. a second visually offset row) is the thing Srijan asked to eyeball;
this spec's job is making sure the grouping *exists* structurally, not picking the final CSS.

### 4.3 Daybook tab

New hook `useDaybook({ bsDate? })` (`lib/hooks/use-reports.ts`, wrapping a new
`reportsApi.daybook` method in `lib/api/reports.api.ts` — same file REP-1's other report calls
already live in). `<BsDateInput>` (single day, not a range) defaulting to today. Renders: a stat
row (`totalInvoiced`/`totalCollected`/`totalRefunded`/`netMovement`), a by-method breakdown
table, and the full entries table (time, type, student, invoice/receipt number, debit, credit,
narration). CSV export of the entries table.

### 4.4 Defaulters tab

New hook, named **`useFinanceDefaulters`** — not `useDefaulters`, which already exists in
`use-finance.ts` for the old-rail page and must keep working unmodified (`report.service.ts`
still backs `finance/reports/page.tsx`, per the standing "old rail stays indefinitely" ruling).
Filter bar: class `<Select>`, min-balance `<Input type="number">`, sort `<Select>`
(`balance｜class｜oldest`). Stat row (`totalDefaulters`, `totalOutstanding`). Table: student,
class/section, balance, overdue invoice count, oldest due date (`<BsDate>`). CSV export.

### 4.5 Aging tab (ruling 1 — genuine duplicate)

Reuses the **existing** `useFeeAging` hook from `lib/hooks/use-reports.ts` verbatim — same
TanStack Query key as `/reports`'s Fees tab, so visiting both in one session shares cache rather
than double-fetching. Renders the same content shape as REP-1's `FeesTab` (bucket stat row,
by-class table, overdue-invoices table with a bucket filter) — copied into this page's own
component rather than importing `FeesTab` directly, since `FeesTab` is page-local to
`app/(school)/reports/page.tsx` and not exported; if a third consumer ever wants it, extracting
to a shared component is the point to do that, not speculatively here (same "don't build the
abstraction before the second real need" call §4.1 already makes for `Card`/`SimpleTable`).
**Not linked back to `/reports`** — ruling 1 is explicit that this page must stand alone.

### 4.6 Collection tab

New hook **`useCollectionSummary`** — not `useCollectionReport`, which already exists in
`use-finance.ts` for the old rail's collection tab and must keep working unmodified. Date-range
`<BsDateInput>` pair (defaults to `resolveRange`'s own default — current BS year to today — so
the picker's default state visually matches what an empty query param already returns), groupBy
toggle (method/fee-head). Stat (`totalCollected`), breakdown table. CSV export.

### 4.7 Fines tab

New hook `useFines`. Date-range picker, class filter. Stat row (`count`, `totalFined`). Accruals
table (invoice, student, days overdue, amount, rule type/value, a visible "Reversed" badge on
rows where `reversed === true` — never hidden, per the backend's own stated intent that a
reversed fine stays in the audit view). CSV export.

### 4.8 Concession Register tab

New hook `useConcessionRegister` wrapping a new `billAssignmentApi.concessionRegister` method
(`lib/api/bill-assignment.api.ts` — matches `BillAssignmentController`, the controller this
endpoint actually lives on). Filter bar: academic year, class, discount reason (`<Select>`s,
reusing `useCorrectionReasons`-shaped patterns already established — actually `useDiscountReasons`
from UI-1's catalog page, since concessions cite discount reasons not correction reasons). **The
one tab needing real pagination controls** (`meta.page`/`meta.limit`/`meta.total` from the
response, `<DataTable>`'s existing pagination footer reused rather than a bespoke pager — same
component every other paginated list in this app already uses) — every other tab on this page
returns its full filtered result set in one response and renders it whole. Table: student, class,
fee head (or "Whole bill"), type, value, cap, discount reason, applied by, applied at, effective
range.

### 4.9 Student Statement tab

Search-then-render, copied from the old-rail `LedgerTab`'s shape
(`app/(school)/finance/reports/page.tsx`'s debounced-search-input → dropdown-of-matches →
selected-student view), not the filter-bar shape the six listing tabs use — this is the one tab
where that different interaction pattern is a deliberate copy, not a gap. Once a student is
selected: date-range picker, then `useStudentStatement(studentId, { from, to })` (new hook, added
to **`lib/hooks/use-bill-payment.ts`** alongside the file's existing `useStudentBalance` — same
file precedent noted in §depends-on, extending rather than creating a new file for one more
per-student endpoint). Renders: student header, opening/closing balance + advance credit + total
debit/credit stat row, then the entries table with its SQL-computed `runningBalance` column shown
per row (the one place a running balance is displayed anywhere in this phase — everywhere else
shows period totals, not a row-by-row cumulative figure).

### 4.10 Cashier tab

**The one write action on this page (ruling 3's second workflow tab).** Two states:

- **No open shift for the current user:** a small open-shift form — academic year `<Select>`
  (`useCurrentAcademicYear`, already used elsewhere), opening float (money input), notes
  (optional). Submit → `POST .../shifts/open` → toast → view flips to the closed-out state below.
- **Open shift exists:** a close-shift form — counted cash (money input), notes (optional). No
  live "expected cash" preview before submit (the backend only computes `expectedCash`/`variance`
  as part of the close response itself, from a `CloseAggregateRow` query scoped to the close
  transaction — there is no separate "preview" endpoint, and building one is out of scope for a
  same-day reconciliation action). On submit → `POST .../:id/close` → the response's
  `expectedCash`/`variance`/`byMethod` breakdown renders directly below the form (green if
  `variance === 0`, amber/red styled by sign otherwise — reusing the existing amount-display
  positive/negative convention already established for e.g. `AmountDisplay`'s `negative` prop).

Below either state: a shift-history table (`useCashierShifts({ cashierId?, date? })`, new hook +
new `lib/api/cashier.api.ts` file — this is a new controller with no existing wrapper file,
matching the one-file-per-controller convention every other Billing-rail phase has followed).
Columns: cashier name (§2.1's new field — this is the concrete screen that needed it), opened/
closed (BS), opening float, counted cash, expected cash, variance, status. Clicking a **closed**
row expands or navigates to a small detail view listing that shift's actual payments — the one
place §2.2's `receivedBy` filter gets used, called as
`useBillPayments({ receivedBy: shift.cashierUserId, dateFrom: shift.openedAt, dateTo:
shift.closedAt })` against the already-existing payments-list hook, no new hook needed for the
drill-down itself.

---

## 5. Files

**Backend:**
- Modified: `apps/api/src/modules/finance/cashier-shift.service.ts` — name-join queries (§2.1).
- Modified: `apps/api/src/modules/finance/entities/cashier-shift.entity.ts` — `cashierName`/
  `closedByName` fields + mapper (§2.1).
- Modified: `apps/api/src/modules/finance/dto/bill-payment.dto.ts` — `receivedBy?` field (§2.2).
- Modified: `apps/api/src/modules/finance/bill-payment.service.ts` — one WHERE clause addition
  (§2.2).
- Modified: `apps/api/src/modules/finance/__tests__/cashier-shift.service.spec.ts` — new case
  (§2.1).
- Modified: `apps/api/src/modules/finance/__tests__/bill-payment.service.spec.ts` — new case
  (§2.2).

**Web:**
- `apps/web/app/(school)/finance/bill/reports/page.tsx` — the whole screen (§4), one file, tabs
  as page-local components (matches REP-1's own single-file-with-page-local-tab-components
  shape).
- `apps/web/lib/api/reports.api.ts` — **modified**, four new methods: `daybook`, `defaulters`,
  `collection`, `fines`.
- `apps/web/lib/hooks/use-reports.ts` — **modified**, four new hooks: `useDaybook`,
  `useFinanceDefaulters`, `useCollectionSummary`, `useFines` (names deliberately distinct from
  the old-rail `useDefaulters`/`useCollectionReport` already in `use-finance.ts` — §4.4/§4.6).
- `apps/web/lib/api/bill-assignment.api.ts` — **modified**, one new method:
  `concessionRegister`.
- `apps/web/lib/hooks/use-bill-assignment.ts` — **modified**, one new hook:
  `useConcessionRegister` (paginated — §4.8).
- `apps/web/lib/api/bill-payment.api.ts` — **modified**, one new method: `getStatement`
  (alongside the file's existing `getStudentBalance`).
- `apps/web/lib/hooks/use-bill-payment.ts` — **modified**, one new hook: `useStudentStatement`.
- `apps/web/lib/api/cashier.api.ts` — **new file**, wrapping the three cashier endpoints
  (`openShift`, `closeShift`, `listShifts`) — new controller, no existing wrapper (§4.10).
- `apps/web/lib/hooks/use-cashier.ts` — **new file**: `useOpenShift`, `useCloseShift`,
  `useCashierShifts`, each invalidating `['cashier-shifts']` on the two mutations.
- `apps/web/types/api.types.ts` — new types: `DaybookReport`, `DefaultersReport` (new-rail shape
  — distinct from whatever the old rail's defaulters type is already called, if anything),
  `CollectionSummaryReport`, `FinesReport`, `ConcessionRegisterEntry`, `StudentStatement`,
  `CashierShift`, `CashierCloseResult`.

**Modified (nav/access):**
- `apps/web/components/layout/sidebar.tsx` — one new sub-item (§3).
- `apps/web/lib/route-access.ts` — one new row (§3).

---

## 6. Proof approach — and where I'll want your eyeball

**Tier 1 — component/hook tests:** the tab-grouping's structural shape (six-then-two, not
re-verified visually by a test — that's tier 3 — but the `Separator` renders between index 5 and
6 regardless of data state); the Cashier tab's two-state branch (no-shift form vs. open-shift
form) as a pure render test keyed on mocked query data, mirroring how UI-5 tier-1 tested its
type-switcher's conditional field rendering.

**Tier 2 — real calls against the running dev backend (`demo` tenant), read back with raw
`SELECT`:** open a cashier shift, record a payment as that user, close the shift — confirm the
UI's `expectedCash`/`variance`/`byMethod` match a hand-computed expectation from the same
`SELECT` the backend's own aggregation runs; confirm `cashierName` renders (not a UUID) in the
shift-history table; confirm the drill-down (§4.10, `receivedBy` filter) returns exactly the
payment just recorded and nothing else; visit both `/reports`'s Fees tab and this page's Aging
tab in one session, confirm they show identical numbers (ruling 1's duplication is real
duplication of *display*, not of *data*).

**Tier 3 — manual eyeball, two points:**
1. **The tab grouping itself (ruling 3, §4.2).** Does the six-then-two split actually read as two
   different kinds of thing at a glance, or does the divider disappear into "eight tabs, one
   slightly different"? This is the literal thing Srijan asked to look at before calling it done.
2. **The Cashier close flow's variance styling.** Does a nonzero variance read as clearly
   "something to look at" without reading as alarming for a small, explainable rounding-scale
   difference — same tone question UI-5's cap-preview honesty check raised for a different
   screen.

No standing Playwright dependency in this repo (confirmed at UI-1) — tier 3 is a real
click-through.

---

## Summary

| Question | Answer |
|---|---|
| New backend work | Two small additions, both pre-approved: cashier shift name join, `receivedBy` filter on the payments list (§2) |
| Page shape | One new page, `/finance/bill/reports`, one `<Tabs>` root, eight tabs in two visually distinct groups (ruling 3) |
| Aging | Genuinely duplicated — same `useFeeAging` hook/cache as `/reports`, a second tab here, `/reports` untouched (ruling 1) |
| Hook-naming collisions | Two: `useDefaulters`/`useCollectionReport` already exist for the old rail — new hooks named `useFinanceDefaulters`/`useCollectionSummary` to avoid colliding (§4.4/§4.6) |
| Concession register | The one paginated tab — reuses `<DataTable>`'s existing pager, not a bespoke one (§4.8) |
| Student statement | Search-then-render, copied from the old-rail `LedgerTab` shape, not the filter-bar shape the other six tabs use (§4.9) |
| Cashier | The one write action — open/close form + shift history + a payments drill-down using §2.2's new filter (§4.10) |
| Parent view | Out of scope this phase, same precedent as UI-5 ruling 4 |
| Eyeball points | (1) Does the six-then-two tab grouping actually read as two kinds of thing; (2) does the close flow's variance styling read as informative, not alarming |
