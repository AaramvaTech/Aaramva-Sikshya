# UI-2-SPEC — Assignment & concessions admin screens

**Target path in repo:** `docs/api-contracts/UI-2-SPEC.md`
**Branch (not yet created):** `feat/ui-2-assignment`
**Depends on:** UI-1 (merged, `main` @ `b31e36d`) — reuses its nav section, catalog hooks, and `ConfigSection`/shared-component toolkit. `docs/api-contracts/BILL-ADMIN-UI-discovery.md` (UI-1 discovery) + the UI-2 discovery report approved in chat (not yet a committed file — folded into this spec instead of duplicated).
**Covers:** the BILL-2 surface — per-student fee-structure assignment, fee overrides, concessions, transport assignment, and bulk-assign. Second of seven phases (Catalog ✓ → **Assignment** → Bill Runs → Payment Counter → Corrections → Reports → Settings).
**Status:** Spec only. Not built. Stop point: Srijan reviews and rules on the two flagged eyeball points (§7) and the small backend addition (§2) before any code is written.

---

## 0. What this phase does and does not do

**Does:** ship two real, usable admin surfaces — a per-student "Billing" tab on the existing student detail page (assign/override/concession/transport + a live fee-preview), and a new bulk-assign page with background-job progress tracking. Adds exactly one small backend read endpoint (§2). Everything else rides on already-live BILL-2 endpoints.

**Does not:**
- Touch the old-rail "Fees" tab on the student detail page (`FeesTab`, `FeeAssignment` type, `customAmount`/discount/waiver) — stays exactly as-is, new tab sits alongside it per the placement ruling (§3).
- Build the concession register (`GET reports/concession-register`) — deferred to UI-6 Reports per ruling; it's a report by nature and belongs with the other reports, not scattered into this phase. Logged here as **UI-6 scope**, not built.
- Build a school-wide "browse all current assignments" table. No backend endpoint returns that (assignment reads are always per-student), and building one is out of scope for this phase — assignment visibility is per-student (the Billing tab) or per-bulk-job (the assignment page tracks the job you just ran, not a history of all past jobs — see the job-history gap noted in §5.2).
- Add a PARENT-facing view of any of this. `fee-preview` already allows PARENT server-side, but a parent-facing screen is WEB-P portal territory, a separate arc — out of scope here.
- Check or build for dark mode. Per the standing rule confirmed after UI-1 shipped: dark mode is deliberately disabled app-wide (`forcedTheme="light"`), so unlike UI-1's own §2/§7, there is no dark-mode eyeball point in this spec. Light mode only.

---

## 1. What already exists — read directly, not assumed

All five BILL-2 write surfaces are live on `BillAssignmentController` (`@Controller('finance')`), confirmed by reading the controller and every DTO in `apps/api/src/modules/finance/dto/`:

| Resource | Endpoints | Roles |
|---|---|---|
| Fee structure assignment | `POST students/:studentId/fee-structure` | ACCOUNTANT_AND_ABOVE |
| Bulk assign | `POST bill/fee-structures/:id/bulk-assign` → job id | ACCOUNTANT_AND_ABOVE |
| Job status | `GET jobs/:id` (shared with BILL-8 bulk-print) | ACCOUNTANT_AND_ABOVE |
| Fee overrides | `POST/GET fee-overrides`, `PATCH/DELETE :id` | create/read/update ACCOUNTANT_AND_ABOVE, delete OWNER_ONLY |
| Concessions | `POST/GET concessions`, `PATCH/DELETE :id` | same split |
| Transport assignments | `POST/GET transport-assignments`, `PATCH/DELETE :id` | same split |
| Fee preview | `GET students/:studentId/fee-preview` | ACCOUNTANT_AND_ABOVE + PARENT (self-scoped) |

**The one asymmetry, and the reason this spec adds an endpoint (§2):** overrides, concessions, and transport-assignments all have a `GET` list-by-student. The fee-structure assignment does not — only `POST assign` exists. `StudentFeeStructureAssignmentService` has no `findAll`, only two internal lookups (`findActiveAssignment`, `findAssignmentOverlappingPeriod`) used by `FeePreviewService` and the bulk-assign job runner, never exposed to a controller.

**Response DTOs, read directly from `entities/bill-assignment.entity.ts`:** overrides and concessions already return joined `feeHeadName`/`discountReasonName`. The assignment and transport-assignment DTOs return bare `feeStructureId`/`transportRouteId` — no name. This is the client-side join gap, ruled on in §4.

**Job lifecycle, read from `bulk-assign-runner.service.ts` + `bulk-assign.poller.ts`:** `PENDING → RUNNING → COMPLETED`, or `→ FAILED`. A `@nestjs/schedule` `@Interval` drains every tenant's `PENDING`/`RUNNING` jobs **every 10 seconds** — this sets the honest floor on how fast a client can ever see movement (§5.2, §7).

**Existing web patterns confirmed by reading the actual files, not the prior discovery report's summary of them:**
- `components/finance/generate-invoice-dialog.tsx` — the single-student picker (300ms-debounced search against `useStudents({ search, limit, page })`, dropdown of name + admission no.) and the bulk-by-class `<Select>` — both lifted directly, not rebuilt.
- `lib/hooks/use-bill-catalog.ts` (UI-1) — `useFeeStructures`, `useFeeHeads`, `useDiscountReasons`, `useTransportRoutes` all already exist. Zero new catalog-read hooks needed.
- **Role-gating precedent, verified — and a correction to what UI-1's own spec claimed.** UI-1's spec (§5.1) said OWNER_ONLY delete actions would be "hidden client-side for non-owner viewers." Reading the shipped `app/(school)/finance/bill/catalog/page.tsx` (852 lines) and `components/shared/config-section.tsx` directly: **no such gating exists** — `ConfigRow`'s delete button renders unconditionally; the page has no role check anywhere. The backend's 403 is the only real gate today. The actual, working precedent for this kind of thing lives elsewhere: `app/(school)/reports/page.tsx:459` — `const role = useAuthStore((s) => s.user?.role);` then a plain conditional. **This spec uses the verified `reports/page.tsx` pattern**, not the aspirational-but-unbuilt UI-1 description.
- `app/(school)/students/[id]/page.tsx`'s existing old-rail `FeesTab` (line 893) — an academic-year `<Select>` defaulting to `useCurrentAcademicYear()`, exactly the pattern the new Billing tab's year-scoping should mirror.
- `StudentDetail.currentEnrollment.classId` (`types/api.types.ts:347`) — already available on the page's loaded `student` object, needed to scope `useFeeStructures({ academicYearId, classId })` in the assignment form so the picker only shows structures actually built for this student's class.

---

## 2. The backend addition — read endpoint for assignment history

**`GET /finance/students/:studentId/fee-structure`** — new route on `BillAssignmentController`, `@Roles(...ACCOUNTANT_AND_ABOVE)` (matching its three siblings' list endpoints — **not** extended to PARENT; `fee-preview` is the deliberate self-service view for that role, this is an admin/audit list like the other three).

- **Query:** `academicYearId?` (optional filter — omitted returns full history across all years).
- **Response:** reuses the **existing** `StudentFeeStructureAssignmentResponseDto[]` unchanged (no new DTO) — `{ id, studentId, feeStructureId, academicYearId, effectiveFrom, effectiveTo, assignedBy, createdAt }[]`, ordered `effective_from DESC`.
- **Not paginated.** Same reasoning as `guardians`/`my-children`-style per-student sub-resource lists elsewhere in this codebase: cardinality is inherently tiny (a fee structure changes rarely; realistically single digits per student per lifetime), unlike the admin-wide, filterable `fee-overrides`/`concessions`/`transport-assignments` GETs (which list across potentially many students and correctly do paginate).
- **New service method:** `StudentFeeStructureAssignmentService.findAllForStudent(studentId, academicYearId?)` — a straight `SELECT * FROM student_fee_structure_assignments WHERE student_id = $1 AND deleted_at IS NULL [AND academic_year_id = $2] ORDER BY effective_from DESC`, mapped through the existing `toStudentFeeStructureAssignmentResponse`.
- **"Current" is derived client-side, not a server field:** because `assign()` always closes the prior open row (`effective_to = new.effectiveFrom - 1`) before inserting the new one, the row(s) with `effectiveTo === null` are the currently-active assignment(s) — one per academic year that has ever had an assignment. The Billing tab filters by the selected academic year, so in practice there's at most one "current" row in view at a time.
- **Test:** one new backend spec on `StudentFeeStructureAssignmentService`/`BillAssignmentController` mirroring the existing `findAll` test shape already used for overrides/concessions/transport (create two assignments for the same student across two effective ranges, confirm both come back ordered, confirm the closed row's `effectiveTo` matches the new row's `effectiveFrom - 1`).

Everything else in this phase is UI-only against already-live endpoints.

---

## 3. Placement — confirmed, not re-litigated

Per ruling: a new **"Billing" tab** on `app/(school)/students/[id]/page.tsx`, added to the existing `TABS` array (`overview | enrollment | documents | fees | billing`) — a sibling to, not a replacement of, the old-rail `fees` tab. Assignment is inherently per-student, so the student page is its natural home; the two tabs stay visually and structurally separate (different components, different hooks, different backend tables) so nobody has to reason about which rail a given screen is reading from.

**Tab visibility is role-gated client-side** using the verified `useAuthStore((s) => s.user?.role)` pattern from `reports/page.tsx` (§1) — the `/students` route itself is open to `ROSTER_VIEWERS` (broader than accountants; teachers/librarians can view a student profile), but every BILL-2 endpoint is `ACCOUNTANT_AND_ABOVE`-gated. The Billing tab entry in `TABS` is filtered out entirely for non-`ACCOUNTANT_AND_ABOVE` roles, matching the "mirror the backend guard in the UI, don't just rely on the 403" discipline this app already uses for route-level access (`route-access.ts`), applied here at the tab level since no finer-than-route mechanism previously existed in this codebase for BILL-2's roles specifically.

**Bulk-assign gets its own new page**, `/finance/bill/assignment` — a new "Assignment" sub-item under the existing "Billing" sidebar section (`sidebar.tsx`, alongside UI-1's "Fee Catalog"), with a new `ROUTE_ACCESS` row: `{ prefix: '/finance/bill/assignment', roles: ACCOUNTANT_AND_ABOVE, endpoint: 'POST /finance/bill/fee-structures/:id/bulk-assign' }`.

---

## 4. The DTO name-join gap — ruled, no backend change

`StudentFeeStructureAssignmentResponseDto` and `StudentTransportAssignmentResponseDto` return bare ids. Rather than widening those DTOs (which would touch the `POST assign`/`POST transport-assignments` response shapes too, beyond what's needed), both the Billing tab and the new `GET .../fee-structure` endpoint (§2, deliberately reusing the same bare DTO) resolve names **client-side**, the same way `generate-invoice-dialog.tsx` already resolves `classes?.find(c => c.id === classId)?.name`:

- `feeStructureId` → `useFeeStructures().find(s => s.id === feeStructureId)?.name`
- `transportRouteId` → `useTransportRoutes().find(r => r.id === transportRouteId)?.name`

Both lists are already fetched by any screen that also needs them for a `<Select>` (the assignment/transport forms themselves), so this is a zero-extra-request join in practice, not a new waterfall. One-line note only — no schema, no backend PR.

---

## 5. The two screens, field by field

### 5.1 Student detail → "Billing" tab

New component `components/finance/student-billing-tab.tsx` (`<StudentBillingTab studentId={id} classId={student.currentEnrollment?.classId} />`), composed of four panels plus a live preview — mirrors `FeesTab`'s year-selector pattern (`useCurrentAcademicYear()` default, overridable `<Select>`) as the shared context for every panel below.

**A. Fee Structure Assignment panel**
- Current: the `effectiveTo === null` row for the selected year, from `GET .../fee-structure?academicYearId=` (§2) — fee structure name (client-joined, §4), effective-from date (`<BsDate>`).
- History: remaining rows for the year (or all years if the toggle is broadened), small table — effective range + fee structure name. Real history value, which is the entire reason §2 exists.
- Action: "Assign / Change" opens a small form — `feeStructureId` (`<Select>`, `useFeeStructures({ academicYearId, classId })` scoped to the student's own class), `effectiveFrom` (`<BsDateInput>`). `POST students/:id/fee-structure`.
- No delete/edit on this resource — matches the backend (assign-only; "changing" is a new POST that closes the old row, not a PATCH).

**B. Fee Overrides panel**
- List: `GET fee-overrides?studentId=&academicYearId=` — already includes `feeHeadName` (no join needed here). Row: fee head, override amount, reason, effective range.
- Add: `feeHeadId` (`<Select>`, `useFeeHeads()`), `academicYearId` (from the tab's shared year context), `overrideAmount` (money input, `@IsMoneyString()`), `reason` (optional text, ≤500), `effectiveFrom`/`effectiveTo` (`<BsDateInput>`, `effectiveTo` optional).
- Edit: inline (`ConfigRow`-style or a small dialog — see §6 for the file-count call), `PATCH fee-overrides/:id`.
- Delete: OWNER_ONLY, gated client-side per §1/§3's verified pattern (role check, not the UI-1 aspiration).

**C. Concessions panel**
- List: `GET concessions?studentId=&academicYearId=` — includes `feeHeadName`/`discountReasonName`. Row: scope ("Whole bill" when `feeHeadId` is null, else the head name), type badge (PERCENT/AMOUNT), value, cap (if set), discount reason, effective range, notes.
- Add: `feeHeadId` (optional `<Select>`, `useFeeHeads()`, with an explicit "Whole bill" option that clears it to `undefined`), `type` (select PERCENT/AMOUNT), `value` (money-formatted input regardless of type — confirmed from the DTO's `@IsMoneyString()`, so a 10% concession is still entered/stored as the string `"10.00"`, not a raw number; the form label should say "Percent" vs "Amount" based on `type` so this doesn't read as a bug), `capAmount` (optional money input), `discountReasonId` (`<Select>`, `useDiscountReasons()`), `effectiveFrom`/`effectiveTo`, `notes` (optional textarea, ≤1000).
- Delete: OWNER_ONLY, same gating.

**D. Transport Assignment panel**
- List: `GET transport-assignments?studentId=` (no `academicYearId` — this resource is year-agnostic by design, confirmed from the DTO). Current = the `effectiveTo === null` row.
- Add/change: `transportRouteId` (`<Select>`, `useTransportRoutes()`), `effectiveFrom`/`effectiveTo`.
- Delete: OWNER_ONLY.

**E. Fee Preview panel — read-only, the payoff view**
- `GET students/:id/fee-preview?academicYearId=&asOfDate=` (defaults to the tab's selected year + today). Renders `FeePreviewResponseDto` as a table: per-head gross → override (if any) → concessions applied (with reason) → net, a transport line if assigned, whole-bill concessions, and gross/concession/net totals.
- **404 handling:** "no active assignment" renders as an explicit empty-state ("No fee structure assigned for {year} — assign one above"), not a generic error — this is an expected, common state (a student with no assignment yet), not a failure.
- **Cross-panel invalidation — called out explicitly because this exact bug class has already bitten this codebase once (WEB-P Phase 3: `useApplyLeave` only invalidated the admin's query key, silently missing the new self-service screen's key).** Every mutation in panels A–D must invalidate the fee-preview query key in addition to its own list's key, so the preview visibly updates the moment any input changes — this is the whole point of the panel and the first thing to check by eye (§7).

### 5.2 Bulk-Assign page (`/finance/bill/assignment`)

New page, new dialog/flow component (`components/finance/bulk-assign-dialog.tsx`), structurally mirroring `generate-invoice-dialog.tsx`'s single/bulk tab shape but adapted, not copy-pasted:

- **Step 1 — fee structure:** `<Select>`, `useFeeStructures({ academicYearId })` (year picked first, same `useCurrentAcademicYear()` default as everywhere else). This determines `bulk/fee-structures/:id/bulk-assign`'s `:id`.
- **Step 2 — scope**, `scopeType`:
  - `CLASS` — reuses `generate-invoice-dialog.tsx`'s exact class `<Select>` plus an optional section `<Select>` cascading from the chosen class (the class→section pattern already used in attendance/exams/timetable pickers).
  - `STUDENT_LIST` — **a genuine adaptation, not a literal reuse.** `generate-invoice-dialog.tsx`'s search dropdown replaces a single selection on pick; bulk-assign needs an array. Same debounced `useStudents({ search })` dropdown, but each pick **adds a removable chip** to a running list instead of replacing the input, and submits `studentIds: string[]`.
- **Step 3 — effective date:** `<BsDateInput>`.
- **Submit** → `POST bill/fee-structures/:id/bulk-assign` → job id → hand off to a new shared **`<BulkJobProgress jobId />`** component (§6) — built shared because the backend's own `GET jobs/:id` is deliberately reused for BILL-8 bulk-print too (per that controller's own comment), so this component is the one piece of UI both this phase and a future print-job screen can point at.
  - Polls `GET jobs/:id` every **3s** while `status` is `PENDING`/`RUNNING` (stops polling on `COMPLETED`/`FAILED`) — chosen against the server's own 10s drain cadence (§1): fast enough to feel responsive, but the first visible movement can still legitimately take up to ~10s, which is a real expectation to set before anyone watches this live (§7).
  - Renders: status badge, a `processed / total` progress bar, and on `COMPLETED` with `failedCount > 0`, a failures table (`studentId` resolved to a name from the roster already held in local state from Step 2 — the `CLASS`-scope roster isn't separately fetched by the client today, so a `CLASS`-scoped failure row falls back to showing the raw id, noted as a known small gap rather than silently pretending to resolve it).

**Known, deliberate gap — no job history.** The backend has no "list all bulk-assign jobs" endpoint, only `GET jobs/:id` for one job by id. This page tracks only the job it just launched (kept in local/URL state); navigating away loses the ability to check on it later. Flagged here as accepted scope, not silently discovered later — adding a list endpoint is a real but separate piece of backend work, not requested for this phase.

---

## 6. Files

**New (backend):**
- Modified: `apps/api/src/modules/finance/bill-assignment.controller.ts` — one new `GET students/:studentId/fee-structure` route (§2).
- Modified: `apps/api/src/modules/finance/student-fee-structure-assignment.service.ts` — one new `findAllForStudent` method.
- Modified: `apps/api/src/modules/finance/__tests__/` — one new spec covering the read endpoint.

**New (web):**
- `apps/web/app/(school)/finance/bill/assignment/page.tsx` — the bulk-assign page.
- `apps/web/components/finance/student-billing-tab.tsx` — the tab container + year-selector, composing four sub-panel components (`fee-structure-assignment-panel.tsx`, `fee-overrides-panel.tsx`, `student-concessions-panel.tsx`, `transport-assignment-panel.tsx`) and the preview panel — kept as separate small files rather than one large one, since each panel has its own form/list/mutation set and this mirrors how UI-1 split the Fee Structures dialog out from the rest of the catalog page rather than inlining everything into one file.
- `apps/web/components/finance/bulk-assign-dialog.tsx` — the bulk-assign flow (§5.2).
- `apps/web/components/finance/bulk-job-progress.tsx` — the shared, reusable job-polling component (§5.2), deliberately generic over `jobId` so BILL-8's future bulk-print screen can reuse it verbatim.
- `apps/web/lib/api/bill-assignment.api.ts` — axios wrappers for all six endpoints in §1/§2.
- `apps/web/lib/hooks/use-bill-assignment.ts` — TanStack Query hooks (list/create/update/delete × 3 resources + assign + bulk-assign + job-poll + fee-preview), same shape as `use-bill-catalog.ts`.
- `apps/web/lib/schemas/bill-assignment.schema.ts` — one file, four small Zod schemas (assign, override, concession, transport-assignment) — bundled rather than split, matching how small each one is (4–8 fields).

**Modified (web):**
- `apps/web/app/(school)/students/[id]/page.tsx` — new `'billing'` entry in `TABS` (role-filtered per §3), new render branch calling `<StudentBillingTab />`.
- `apps/web/components/layout/sidebar.tsx` — one new sub-item, "Assignment," under the existing "Billing" section.
- `apps/web/lib/route-access.ts` — one new `ROUTE_ACCESS` row (§3).
- `apps/web/types/api.types.ts` — new response types for the five resources in §1/§2, ported directly from `entities/bill-assignment.entity.ts` and `fee-preview.service.ts`'s `FeePreviewResponseDto` (both already read in full — no guessing at build time).

---

## 7. Proof approach — three tiers, and the two eyeball points Srijan asked for

**Tier 1 — component/hook tests (vitest + testing-library, jsdom):** the four Zod schemas' validation rules; `bulk-job-progress.tsx`'s polling hook — asserts it actually stops refetching once `status` leaves `PENDING`/`RUNNING` (the same "does the gate actually gate" discipline WEB-P's `{enabled}` regression tests established, applied to a genuinely new async shape: a *terminal-state* stop condition rather than a boolean enable flag); the `STUDENT_LIST` chip add/remove logic; the Billing-tab role-gate itself (`role: 'TEACHER'` → tab absent from `TABS`, `role: 'ACCOUNTANT'` → present) — this is the one this spec is making a real claim about (§3), so it gets a real test, not just a description.

**Tier 2 — real calls against the running dev backend (`demo` tenant), read back with raw `SELECT`:** assign a structure, add an override, add a concession, add a transport assignment, then hand-verify `fee-preview`'s arithmetic against the expected numbers (same discipline the original BILL-2 backend checkpoint used). A real bulk-assign against a real class, polled to `COMPLETED`, `SELECT COUNT(*)` read-back matching the class roster — this is close to verbatim the acceptance bar `BILL-SPEC.md §6`'s own CHECKPOINT 3 already set, reused here for the UI path instead of a raw HTTP call.

**Tier 3 — manual eyeball, the two points Srijan specifically flagged:**
1. **The student-detail Billing tab.** Does the four-panel-plus-preview layout read clearly on a real screen; does the preview visibly and immediately update after a write in any of the four panels (the cross-invalidation requirement in §5.1 — this is the one most likely to silently regress into the exact bug WEB-P already hit once); does the role-gate correctly hide the tab end-to-end (not just in the unit test) for a non-accountant login. Light mode only (§0).
2. **The bulk-job progress UI.** Does the ~3s poll against a real ~10s server drain cadence feel acceptable to watch, or does the up-to-10s initial silence read as broken; does the `STUDENT_LIST` chip picker feel natural to add/remove from; does the failures table (deliberately provoked with at least one bad row in the proof) read clearly, including the known `CLASS`-scope id-fallback gap noted in §5.2.

No standing Playwright dependency in this repo (confirmed at UI-1) — tier 3 is a real click-through, scripted automation only if a browser tool happens to be available to whichever session builds this.

---

## Summary

| Question | Answer |
|---|---|
| New backend work | One read endpoint, `GET /finance/students/:studentId/fee-structure` (§2) — everything else already live |
| New routes | `/finance/bill/assignment` (bulk-assign page); Billing tab added to the existing `/students/[id]` route |
| Old-rail "Fees" tab | Untouched, stays exactly as-is, sits alongside the new tab |
| DTO name-join gap | Client-side join only, reusing UI-1's catalog hooks (§4) — no backend change |
| Concession register | Deferred to UI-6 Reports (ruled) — not built here |
| Role-gating pattern | `useAuthStore((s) => s.user?.role)` (verified live in `reports/page.tsx`) — **not** UI-1's own spec claim, which reading the shipped code shows was never actually built |
| Known accepted gaps | No bulk-assign job history list; `CLASS`-scope bulk-assign failures fall back to raw student id in the UI (no separately-fetched roster) |
| Eyeball points | (1) Student-detail Billing tab — layout, live-preview invalidation, role-gate; (2) bulk-job progress UI — poll cadence honesty, chip picker, failures table |
