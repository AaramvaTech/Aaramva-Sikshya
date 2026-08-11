# UI-3-SPEC — Bill Runs (draft → inline review → post)

**Target path in repo:** `docs/api-contracts/UI-3-SPEC.md`
**Branch (not yet created):** `feat/ui-3-bill-runs`
**Depends on:** UI-1 (merged, `main` @ `b31e36d`) + UI-2 (merged, `main` @ `5899e20`) — reuses the "Billing" nav section, `<DataTable>`/`<ConfirmDialog>`/`<StatusBadge>` shared components, and the toggle-tab dialog shape UI-2 already built for bulk-assign.
**Covers:** the BILL-4 surface — generate a draft bill run, review it as one screen, exclude students, post it. Third of seven phases (Catalog ✓ → Assignment ✓ → **Bill Runs** → Payment Counter → Corrections → Reports → Settings).
**Status:** Spec only. Not built. Stop point: Srijan reviews and rules on the flag in §3 and the two eyeball points (§8) before any code is written.

---

## 0. What this phase does and does not do

**Does:** ship one list page and one review page against the already-live `BillRunController`. Adds one small backend read addition — class/section context on run lines (§2). Everything else rides on already-live BILL-4 endpoints.

**Does not:**
- Build a "browse posted invoices" screen. `GET /finance/bill/invoices`, `GET /finance/bill/invoices/:id`, `GET /students/:studentId/bill/invoices` are all live on `BillInvoiceController` but have zero web consumers today (`app/(school)/finance/invoices/page.tsx` is wired to the unrelated old-rail `FinanceController`, not this table). Flagged, not decided — my default is that this belongs to UI-4 (Payment Counter), which is the phase that actually needs to look an invoice up to record a payment against it. If you want a posted-invoice browser inside this phase instead, say so and I'll fold it in.
- Build a regenerate endpoint. See §3 — flagged as a correction to the ruling, not silently built.
- Build a bulk-assign-style background job polled via `GET /finance/jobs/:id`. BILL-4's post step never wrote into that table — see §1.
- Check or build for dark mode. Standing rule (confirmed at UI-1, re-confirmed at UI-2): `forcedTheme="light"`, light mode only.

---

## 1. What already exists — backend surface, confirmed by reading source

`BillRunController` (`@Controller('finance/bill/runs')`, `ACCOUNTANT_AND_ABOVE` on every route):

| Route | Does |
|---|---|
| `POST /` | Generate draft. Synchronous — resolves the roster, calls `BillLineResolverService` per student, writes `bill_runs` + one `bill_run_lines` row per student. Zero `bill_invoices`, zero ledger writes. Idempotency key on `(academicYear, bsMonth, scope, classId)` — a second draft for the same period 409s with the existing run's id in the message. |
| `GET /` | Paginated list, filters: `academicYearId`, `bsYear`, `bsMonth`, `status`. |
| `GET /:id` | Run header (status/totals/dates) + paginated lines (filterable by `outcome`) + `outcomeSummary` (live `GROUP BY outcome` count, computed fresh on every call — not cached). |
| `PATCH /:id/exclude` | `studentIds[]` → those lines flip `DRAFT → EXCLUDED`; totals re-aggregate in the same call. DRAFT-run-only (400 otherwise). **No reverse of this** — nothing un-excludes a line short of voiding the whole run. |
| `POST /:id/post` | `DRAFT → POSTING`, stamps `posted_by`. Idempotent — POSTED/POSTING return current state, no-op, no error. The real work (invoice + ledger writes) happens out-of-band in `BillRunPostRunnerService`, drained every 10s by `BillRunPostPoller`'s `@nestjs/schedule` interval. Per-line fault tolerant — one student's failure doesn't abort the run; that line's outcome becomes `FAILED` with a reason, the run still reaches `POSTED` once every line's been attempted. |
| `DELETE /:id` | Void. DRAFT-only, soft-delete, frees the idempotency key so the period can be redrafted. |

**Totals are always "what would post right now," for free.** `total_gross/concession/tax/net` on the run row are recomputed via `SUM(...) WHERE outcome = 'DRAFT'` at the end of both `generateDraft` and `excludeLines` (`bill-run.service.ts:111-125`, `:247-259`) — so at any point while the run is still DRAFT, the run's own totals already exclude everything skipped or excluded. **This is exactly the number the Post confirmation needs (§6) — no new endpoint required for it.**

**No `GET /finance/jobs/:id` involvement.** UI-2's bulk-assign and the spec's own original plan for BILL-4 both pointed at that shared jobs table. `BillRunPostRunnerService` never touches it — posting progress lives entirely on `bill_runs.status` + `bill_run_lines.outcome`, polled via the same `GET /:id` the review screen already uses. One poll target for both "reviewing a draft" and "watching a post finish."

**Outcome enum** (`bill-run.dto.ts:10-12`): `DRAFT, POSTED, SKIPPED_NO_ASSIGNMENT, SKIPPED_ALREADY_BILLED, EXCLUDED, FAILED`. `SKIPPED_NO_ASSIGNMENT`'s `skipReason` is already a real sentence (`bill-line-resolver.service.ts:101`: `"No active fee structure assignment for this student in the given academic year"`) — no backend change needed to make that reason readable, it already is one.

**Existing web patterns, confirmed by reading the actual files:**
- `components/finance/bulk-assign-dialog.tsx` — the `CLASS` / `STUDENT_LIST` toggle-tab bar (`scopeType` state, underlined-tab buttons) is the direct template for this phase's create-draft dialog, swapped to `CLASS` / `WHOLE_SCHOOL` (no student-picker branch needed — `CreateBillRunDto` has no `STUDENT_LIST` scope).
- `app/(school)/finance/invoices/page.tsx` — the `<DataTable>` + URL-param filter bar (`useSearchParams`, debounced search, `<Select>` filters, `exportConfig`) is the template for the run list page, and for the outcome-filtered line table inside the review page.
- `components/finance/invoice-status-badge.tsx` — a small dedicated badge component (own `styles`/`labels` maps, not the generic `components/shared/status-badge.tsx`) is this codebase's established pattern whenever a status needs domain-specific colors/labels the generic map doesn't have entries for. Bill-run outcomes get the same treatment (§6) rather than six new entries bolted onto the generic map.
- `components/shared/confirm-dialog.tsx` — the shared confirm component, used for the Post confirmation (§5.4) and Void.
- `use-bill-assignment.ts`'s `jobPollInterval(status)` (`status === 'COMPLETED' || 'FAILED' ? false : 3000`) — a pure, unit-testable function returning the `refetchInterval` value. Same shape, new inputs: `billRunPollInterval(status)` returns `false` once `status` is `POSTED` or `VOIDED`, else a few seconds — used on the review page's `GET /:id` query so it doubles as the posting-progress poll with zero extra wiring.

---

## 2. The backend addition — class/section context on run lines

**Why:** a `WHOLE_SCHOOL` draft's review table lists every active student in the school on one screen (§5.3's whole point). Right now `findOne`'s line query only joins `student_name`/`admission_number` (`bill-run.service.ts:178`) — there's no way to see, sort by, or filter by class, which is the one piece of context that makes a few-hundred-row whole-school table scannable instead of an alphabetical wall of names.

**Change:** widen the existing `JOIN students s` in `BillRunService.findOne` to also `LEFT JOIN classes c ON c.id = s.class_id` and `LEFT JOIN sections sec ON sec.id = s.section_id`, selecting `c.name AS class_name, sec.name AS section_name`. This is the same join shape already proven elsewhere in this exact module — `bill-receipt-document.service.ts:95` (`LEFT JOIN classes c ON c.id = s.class_id`) and `invoice.service.ts:384` (`sec.id = s.section_id`) — composed together rather than invented.

- `BillRunLineRow`/`BillRunLineResponseDto` (`entities/bill-run.entity.ts`) get two new optional fields: `className?: string`, `sectionName?: string`.
- `BillRunLineQueryDto` gets one new optional filter: `classId?: string` (same `@IsOptional() @IsUUID()` shape as every other filter in that file), applied as `AND s.class_id = $n::uuid` — lets the review page's `<Select>` filter a whole-school run down to one class, mirroring the invoices list's existing `classId` filter UX exactly.
- CLASS-scoped runs get the same two fields for free (every line already shares one class) — the frontend simply doesn't render the column when `run.scope === 'CLASS'`, since it'd be a constant.
- **Test:** one new case in `bill-run.service.spec.ts` — a whole-school draft against a two-class fixture, asserting `className`/`sectionName` come back correctly per line and that `classId` filtering returns only the matching subset.

Everything else in this phase is UI-only against already-live endpoints.

---

## 3. Flag — the regenerate endpoint doesn't exist

The ruling says "reuse the exclude/regenerate endpoints." I looked for `regenerate` while writing this and it isn't there. `BillRunController`'s own doc comment (`bill-run.controller.ts:20-24`) says so directly: *"No regenerate endpoint (not named as required by any checkpoint's live proof — draft edits happen via a fresh draft after voiding)."* The original BILL-4-SPEC.md did name `POST /finance/bill/runs/:id/regenerate` ("rebuild draft lines, picks up override/concession edits made since draft") — it just was never built.

Raising this rather than deciding it, since it changes the "adjust" step's shape:

- **My default, if you don't want new backend work added to this phase's already-approved one-addition scope (§2):** "adjust" in this spec means **exclude** (drop specific students from this run) **or void + create a fresh draft** (if the catalog/override/concession data changed and the numbers need recomputing). The review page's "Start Over" affordance is Void (§5.6) → back to the list → new draft, not a live regenerate-in-place button.
- **The alternative, if you want it:** spec and build a real `POST /:id/regenerate` this phase — genuine new backend write-path work (re-run `resolveLine` for every still-DRAFT line, in place, without touching already-EXCLUDED lines), not a "small read addition" like §2. I'd want to scope that as its own numbered task if you choose this.

I've written §5 assuming the first option (exclude + void-and-redraft, both endpoints already live) since that's what's actually shipped. Tell me if you want the second instead before I hand this off to be built.

---

## 4. Placement — nav + route-access

New sidebar sub-item under the existing "Billing" section (`sidebar.tsx:88-91`, alongside "Fee Catalog" and "Assignment"): `{ name: 'Bill Runs', path: '/finance/bill/runs' }`.

New `ROUTE_ACCESS` row (`route-access.ts`, same block as the other two Billing rows): `{ prefix: '/finance/bill/runs', roles: ACCOUNTANT_AND_ABOVE, endpoint: 'POST /finance/bill/runs' }`.

---

## 5. The screens, field by field

### 5.1 List — `/finance/bill/runs`

New page, `<DataTable>` shape lifted from `finance/invoices/page.tsx` (URL-param pagination, filter bar, no export — a bill run isn't a row-shaped CSV export target the way invoices are). Columns: period (BS year/month), scope (`WHOLE_SCHOOL` or class name), status badge, student count, total net, created date. Filter bar: status `<Select>` (`DRAFT/POSTING/POSTED/VOIDED`), academic year `<Select>`, BS year/month. Row click → review page (`/finance/bill/runs/:id`). "+ New Bill Run" action opens the create-draft dialog (§5.2).

### 5.2 Create draft — dialog

New `components/finance/create-bill-run-dialog.tsx`, structurally `bulk-assign-dialog.tsx`'s toggle-tab shape (§1) with the `STUDENT_LIST` branch removed:

- Academic year `<Select>` (`useCurrentAcademicYear()` default, same as every other Billing screen).
- BS year/month — two number inputs or a compact BS month-picker (whichever component the codebase's existing BS-month pickers use elsewhere, e.g. REP-1's report date pickers — reuse, don't invent a new one).
- Scope toggle: `WHOLE_SCHOOL` / `CLASS`. `CLASS` reveals the same class `<Select>` bulk-assign-dialog already uses.
- Issue date / due date — optional `<BsDateInput>` pair, collapsed behind an "Advanced" disclosure (both default server-side per `bill-run.util.ts` if omitted — most drafts won't need to touch these).
- Submit → `POST /finance/bill/runs`. On success, route straight to the review page (`/finance/bill/runs/:id`) — the draft *is* the review, there's no separate "preview" step to land on first (§0/ruling). On 409 (existing run for this period+scope), surface the conflicting run's id as a toast link to that run's review page instead of a bare error.

### 5.3 Review — `/finance/bill/runs/:id` (the core screen)

One page, no wizard steps, no dialogs-within-dialogs. Layout, top to bottom:

1. **Header card** — period, scope (+ class name if `CLASS`), status badge, issue/due date, created-by/date.
2. **Summary strip** — five numbers pulled straight off the run + `outcomeSummary`, always visible (not paginated, not behind a tab): **to be charged** (`outcomeSummary.DRAFT` count + `totalNet` amount — the exact pairing the Post confirmation reuses, §5.4), **skipped — no assignment**, **skipped — already billed**, **excluded**, and (once posting has started) **posted** / **failed**. This is what makes "judge the whole draft before posting" possible without scrolling a few hundred rows — the aggregate is right there before the admin looks at a single line.
3. **Line table** — `<DataTable>`, same filter-bar convention as the invoices list: outcome tabs/`<Select>` (all six values, §6), class `<Select>` filter (§2, hidden for `CLASS`-scoped runs since it'd be redundant), search by name/admission no. (client-side, matching the existing pattern elsewhere). Requested with `limit=200` (the backend's existing max — no new backend capacity needed, §2 confirms the join is cheap) by default with the pager only appearing once a run genuinely exceeds that, so the realistic case (a single school's whole-school run) needs zero clicks to see every row.
4. **Per-line action** — DRAFT rows only get a row-level "Exclude" button (small, not a bulk checkbox-select — matches the granularity `PATCH .../exclude` actually offers, which takes a `studentIds[]` array so a *multi-row* checkbox-select-then-exclude is legitimate too if you want it row-dense; my default is per-row for a first cut, flag if you want bulk-select). Confirmed via `<ConfirmDialog>` — "Exclude {name} from this run? This can't be undone without voiding the whole run" (§1: no un-exclude endpoint exists), not a silent one-click action.
5. **Footer action bar** — "Void Run" (DRAFT-only, §5.6) and "Post" (§5.4), both disabled once the run has left DRAFT.

Once `status !== 'DRAFT'`, the exclude buttons and Void disappear (the run is immutable at that point) and the page becomes a live status view (§5.5) instead of an editable review.

### 5.4 Post confirmation — non-negotiable, per ruling

`<ConfirmDialog>` off the "Post" button, copy built entirely from data the run response already carries (§1 — no new endpoint): **"Post {outcomeSummary.DRAFT} invoices totalling ₹{totalNet}? This creates real invoices and ledger entries and cannot be undone — corrections after posting go through credit notes/refunds, not this screen."** The count and amount are the two numbers that make an accidental whole-class post visible before it happens — this is the sentence Srijan's ruling exists to protect, so the wording stays literal (student count + rupee total), not a generic "are you sure."

On confirm → `POST /:id/post` → the page transitions straight into §5.5's live view (the response already reflects `status: 'POSTING'`).

### 5.5 Posting-in-progress / posted

Same review page, now read-only, polling `GET /:id` via `billRunPollInterval(status)` (§1) — stops once `POSTED`. While `POSTING`: the summary strip's "to be charged" count visibly drains into "posted" (and "failed", if any) as lines flip, giving the same kind of live movement `BulkJobProgress` gives bulk-assign, but sourced from `outcomeSummary` instead of a `processed/total` job object (§1 — the two aren't interchangeable, this page has its own small progress-rendering, not a shared component with UI-2's). Once `POSTED`: failed lines (if any) get the same red-badge, reason-visible treatment as a skip (§6) — a partial failure is visible on this same screen, not a separate report.

### 5.6 Void

Footer button on a DRAFT run, `<ConfirmDialog>` ("Void this draft? It can be redrafted from scratch afterward.") → `DELETE /:id` → back to the list.

---

## 6. Outcome states — the six badges

New `components/finance/bill-run-outcome-badge.tsx`, same shape as the existing `invoice-status-badge.tsx` precedent (§1) — own `styles`/`labels` maps, not the generic `<StatusBadge>`, because every outcome here needs a caption (the `skipReason`) alongside the badge, which the generic component doesn't support:

| Outcome | Badge label | Color family | Caption shown |
|---|---|---|---|
| `DRAFT` | "Will be charged" | green (matches `success` token, same as `PAID`/`ACTIVE`) | — |
| `POSTED` | "Charged" | green, filled/checkmark variant | invoice number, linking out once UI-4 exists to receive that link |
| `SKIPPED_NO_ASSIGNMENT` | "No fee assigned" | gray/neutral (not red — this isn't an error, it's an expected state for a student with no active fee structure) | the resolver's own sentence (§1), verbatim |
| `SKIPPED_ALREADY_BILLED` | "Already billed" | gray/neutral | the resolver's own sentence, which already names the existing invoice id |
| `EXCLUDED` | "Excluded" | slate/violet — deliberately distinct from both the neutral skips and the red failure, since this is the one outcome an admin chose, not the system | — |
| `FAILED` | "Failed" | red/error | the runner's caught error message (§1's `BillRunPostRunnerService.postLine` catch block) |

The neutral-vs-red distinction for the two `SKIPPED_*` states vs `FAILED` is the specific thing the ruling's "self-explaining" bar is asking for — a skip is normal and expected (most whole-school runs will have some), a failure is not, and conflating their color would bury the one state that actually needs attention.

---

## 7. Files

**Backend (§2):**
- Modified: `apps/api/src/modules/finance/bill-run.service.ts` — widen `findOne`'s line query (JOIN), add `classId` filter branch.
- Modified: `apps/api/src/modules/finance/dto/bill-run.dto.ts` — `classId?` on `BillRunLineQueryDto`.
- Modified: `apps/api/src/modules/finance/entities/bill-run.entity.ts` — `className`/`sectionName` on the line row/response types.
- Modified: `apps/api/src/modules/finance/__tests__/bill-run.service.spec.ts` — one new case (§2).

**Web:**
- `apps/web/app/(school)/finance/bill/runs/page.tsx` — list (§5.1).
- `apps/web/app/(school)/finance/bill/runs/[id]/page.tsx` — review / posting / posted (§5.3–5.5), one page, three render states driven by `run.status`.
- `apps/web/components/finance/create-bill-run-dialog.tsx` — draft creation (§5.2).
- `apps/web/components/finance/bill-run-outcome-badge.tsx` — (§6).
- `apps/web/lib/api/bill-run.api.ts` — axios wrappers for the five endpoints.
- `apps/web/lib/hooks/use-bill-run.ts` — TanStack Query hooks: list/create/detail(polling)/exclude/post/void, plus the exported `billRunPollInterval` pure function (§1, tested standalone like its `use-bill-assignment.ts` sibling).
- `apps/web/types/api.types.ts` — `BillRunSummary`, `BillRunDetail`, `BillRunLine` types ported from `entities/bill-run.entity.ts` (including §2's two new fields).

**Modified (web):**
- `apps/web/components/layout/sidebar.tsx` — one new sub-item (§4).
- `apps/web/lib/route-access.ts` — one new row (§4).

---

## 8. Proof approach — and the two eyeball points Srijan asked for

**Tier 1 — component/hook tests:** `billRunPollInterval` (stops at `POSTED`/`VOIDED`, same discipline as `jobPollInterval`'s existing test); `bill-run-outcome-badge.tsx` renders the right label/color per outcome (six cases); the create-draft dialog's `canSubmit` gating (scope-dependent required fields, mirroring `bulk-assign-dialog`'s own test).

**Tier 2 — real calls against the running dev backend (`demo` tenant), read back with raw `SELECT`:** draft a whole-school run, confirm line count matches active-student count and outcomes match expectation (craft one student with no assignment, one already billed via a prior direct post, to exercise both skip reasons for real); exclude a student, confirm totals shrink by exactly that student's `net`; post, poll to `POSTED`, `SELECT` the resulting `bill_invoices` rows and confirm count matches `outcomeSummary.POSTED`; confirm a voided draft's idempotency key frees up (redraft the same period succeeds).

**Tier 3 — manual eyeball, the two points Srijan specifically flagged:**
1. **The review table.** Do the six outcome badges read as instantly distinguishable at a glance on a real whole-school-sized draft (mixed outcomes, not a clean all-DRAFT fixture) — is it obvious *why* a given student isn't being charged without opening anything; does the summary strip (§5.3.2) actually let the admin judge the run's shape before reading a single row; does the class filter (§2) make a large whole-school list actually scannable.
2. **The Post confirmation.** Does the count-and-total wording (§5.4) read as the deliberate, hard-to-misread gate it's meant to be — provoke it on a run with a nonzero exclude count and confirm the number said out loud matches what's actually about to be posted, not the run's original (pre-exclude) size.

No standing Playwright dependency in this repo (confirmed at UI-1) — tier 3 is a real click-through, scripted automation only if a browser tool happens to be available to whichever session builds this.

---

## Summary

| Question | Answer |
|---|---|
| New backend work | Widen `findOne`'s line query with a class/section JOIN + filter (§2) — everything else already live |
| Regenerate endpoint | **Doesn't exist** — flagged in §3, not silently built or silently ignored. Spec defaults to exclude + void-and-redraft; say the word if you want it built for real instead |
| Workflow shape | One page — draft creation lands directly on the review screen; Post is the terminal action on that same screen, not a separate step |
| Post confirmation | Built entirely from existing run totals (§1) — no new endpoint; wording is literal count + rupee total, not generic |
| Outcome clarity | New `BillRunOutcomeBadge` (own component, mirrors `InvoiceStatusBadge`'s precedent) — six distinct label/color/caption combinations, skips deliberately neutral-colored vs failures red |
| Job-progress reuse | Not reused from UI-2 — BILL-4 posting never touches the shared jobs table; review page polls its own `GET /:id` |
| Posted-invoice browser | Out of scope, flagged for UI-4 by default (§0) |
| Eyeball points | (1) Review table — outcome-badge clarity + summary strip on a mixed-outcome draft; (2) Post confirmation — count/total wording matches actual post-time state after an exclude |
