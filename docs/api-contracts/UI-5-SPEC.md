# UI-5-SPEC — Corrections (credit notes, refunds, write-offs)

**Target path in repo:** `docs/api-contracts/UI-5-SPEC.md`
**Branch (not yet created):** `feat/ui-5-corrections`
**Depends on:** UI-1 (merged, `main` @ `b31e36d` — correction-reason CRUD already ships in the Fee Catalog page's "Correction Reasons" tab, nothing to build there), UI-4 (merged, `main` @ `0ce43d1` — reuses the Payment Counter's student/invoice/balance pickers directly).
**Covers:** the BILL-6 surface — request a credit note, refund, or write-off against a student; owner approve/reject/reverse. Fifth of seven phases (Catalog ✓ → Assignment ✓ → Bill Runs ✓ → Payment Counter ✓ → **Corrections** → Reports → Settings).
**Status:** Spec only. Not built. Stop point: Srijan reviews and rules on the two flags below (§0, §3.2) before any code is written.
**Rulings already locked in (from the discovery review):**
1. Threshold setting (`creditNoteApprovalThreshold`) — read-only in this phase, feeds the cap preview; editing it is UI-7 (Settings) scope.
2. Approve/reject get a real note-capturing dialog, not a bare `<ConfirmDialog>` — deliberate deviation from the HR leave-request precedent (§1). **Refined at build approval:** the note is **required on reject only, optional on approve** — a refusal needs a real "why" for the requester and the audit trail; a routine approval doesn't need forced justification beyond the request's own reason code, and requiring one there would just be friction on the common case.
3. One "New Correction" entry point with a type switcher, not three separate routes.
4. Admin-only for v1 — no parent-facing corrections view this phase (the backend's PARENT read-scoping stays live and unused by this phase's UI, ready for whenever a parent view is wanted).
5. Line-item credit notes (`targetInvoiceItemId`) — **build them this phase**, not deferred. The reuse is cheap (the invoice-detail API wrapper already exists, unused) and it closes a real gap — crediting one fee line, not the whole bill — rather than deferring something nearly free.

---

## 0. What this phase does and does not do

**Does:** ship a corrections list, one combined request flow covering all three types, a detail page with the ledger-entry-pair audit trail, and note-capturing approve/reject/reverse actions — all against the already-live `BillCorrectionController`. **One small backend addition, found mid-build, not zero as originally stated** — see `BILL-BUGS.md` `UI5-STUDENTNAME-JOIN`: `findAll`/`findOne` had no student/reason display name to show, only UUIDs. Fixed with a `LEFT JOIN students`/`LEFT JOIN correction_reasons` mirroring `invoice.service.ts`'s own precedent, same shape as UI-3 §2's class/section JOIN. Everything else rides on already-live endpoints.

**Does not:**
- Build correction-reason CRUD — done in UI-1.
- Build the threshold-edit UI — deferred to UI-7 per ruling. This phase only *reads* `GET /finance/settings` for the cap preview (§3.2).
- Build a parent-facing corrections screen — per ruling, admin-only this phase.
- Touch dark mode. Standing rule (confirmed every phase so far): `forcedTheme="light"`, light mode only.
- Flag, not decide (§3.2): whether the New Correction form supports **line-item-level** credit notes (`targetInvoiceItemId`) in v1, or defers to whole-invoice-only.

---

## 1. What already exists — backend surface, confirmed by reading source

`BillCorrectionController` (`@Controller('finance/corrections')`):

| Route | Role | Does |
|---|---|---|
| `POST /credit-notes` | ACCOUNTANT+ | `studentId/academicYearId/targetInvoiceId(+targetInvoiceItemId?)/amount/reasonId`. Auto-posts (`APPROVED`, ledger entry written same request) if `amount < creditNoteApprovalThreshold` (tenant setting, default 5000); otherwise `REQUESTED`. Capped server-side at the invoice's (or line's) outstanding-after-existing-credits. |
| `POST /refunds` | ACCOUNTANT+ | `studentId/academicYearId/amount/reasonId/refundMethod(CASH\|BANK_TRANSFER)/refundReference?`. **Always** `REQUESTED`, no threshold branch. Capped at available advance credit (magnitude of a negative ledger balance). `refundReference` required server-side when `refundMethod === BANK_TRANSFER`. |
| `POST /write-offs` | ACCOUNTANT+ | `studentId/academicYearId/amount/reasonId/targetInvoiceId?`. **Always** `REQUESTED`. Capped at invoice outstanding if `targetInvoiceId` given, else at the student's overall owed balance. |
| `GET /`, `GET /:id` | ACCOUNTANT+, PARENT (object-scoped via `guardians`, unused by this phase's UI per ruling 4) | Paginated list (studentId/type/status filters); detail returns the correction **plus `ledgerEntries: LedgerEntryResponseDto[]`** — the posted entry and its reversal, if any, in one array (`WHERE id = ledger_entry_id OR reverses_entry_id = ledger_entry_id`). |
| `POST /:id/approve` | **OWNER_ONLY** | Body: `{ note? }`. Re-validates the cap live (money may have moved since request), posts the ledger entry, `REQUESTED`-only guard (409 on concurrent double-decide). |
| `POST /:id/reject` | **OWNER_ONLY** | Body: `{ note? }`. Conditional UPDATE, same 409 guard. |
| `POST /:id/reverse` | **OWNER_ONLY** | No body. `APPROVED`-only. Delegates to `LedgerService.reverse` — the correction row stays `APPROVED`; both entries become visible on the next `GET /:id` via the `ledgerEntries` array above. |
| `GET/PATCH /finance/settings` | GET: ACCOUNTANT+, PATCH: OWNER_ONLY | `creditNoteApprovalThreshold` (default 5000 if unset). **This phase only calls GET** (ruling 1) — no settings-edit UI. |

**Direction invariant** (worth restating since it drives the cap-preview math, §3.2): credit notes and write-offs are CREDITs (reduce what's owed); a refund is a DEBIT against advance credit (never increases what's owed).

**Existing web patterns, confirmed by reading the actual files:**
- `app/(school)/hr/leave/page.tsx` — the request/approve/reject list shape (`<DataTable>`, status filter, `<StatusBadge>`, inline Approve/Reject buttons only rendered when the row is pending) is the direct template for the corrections list (§3.1). **Not copied wholesale**: HR's reject fires a hardcoded `'Rejected'` string with no dialog — ruling 2 explicitly deviates from this for corrections.
- `app/(school)/finance/bill/payments/new/page.tsx` (UI-4) — `useStudents` (student search picker), `useStudentOutstandingInvoices(studentId)` (returns `BillInvoice[]` already carrying a server-computed `balance` field — exactly the credit-note/write-off invoice cap), `useStudentBalance(studentId)` (returns `{ balance, sign: 'OWES'|'ADVANCE'|'ZERO' }` — exactly the refund/balance-write-off cap), `useCurrentAcademicYear()`. All reused as-is, zero new backend calls to build the request form's context panels.
- `app/(school)/finance/bill/catalog/page.tsx` (UI-1) — `useCorrectionReasons()` already live; `CorrectionReasonRow` has no `type` column, so the reason list is shared across all three correction types (no per-type filtering needed).
- `app/(school)/finance/bill/payments/page.tsx` (UI-4) — the in-page owner-gating precedent this phase copies verbatim for approve/reject/reverse: `const OWNER_ROLES = ['SCHOOL_OWNER', 'PLATFORM_ADMIN']; const role = useAuthStore((s) => s.user?.role); const isOwner = !!role && OWNER_ROLES.includes(role);` — buttons render only when `isOwner`, backed by the real 403 (route-level access stays ACCOUNTANT+, same split UI-4 already established for its own OWNER_ONLY void action).
- `components/shared/confirm-dialog.tsx` — fits `reverse` as-is (no note in the DTO, no note needed in the UI).
- `components/shared/status-badge.tsx` — has `APPROVED`/`REJECTED` but **no `REQUESTED` key** (falls back to the gray "unknown" style). One-line addition (§4).
- `lib/api/bill-invoice.api.ts` — `billInvoiceApi.get(id)` (single-invoice detail, includes `items?: BillInvoiceItem[]`) **already exists but has zero consumers today** — built in UI-4, never wired to a hook. Relevant to the item-level credit-note question (§3.2).

---

## 2. Placement — nav + route-access

New sidebar sub-item under "Billing" (`sidebar.tsx`, after the existing Payments row): `{ name: 'Corrections', path: '/finance/bill/corrections' }`.

New `ROUTE_ACCESS` row (`route-access.ts`, same block as the other Billing rows, after `/finance/bill/payments`): `{ prefix: '/finance/bill/corrections', roles: ACCOUNTANT_AND_ABOVE, endpoint: 'POST /finance/corrections/credit-notes' }` — mirrors the request-side guard (the same split UI-4 uses: route-level = base ACCOUNTANT+ guard, OWNER_ONLY approve/reject/reverse enforced in-page per §1's gating snippet, not at the route level).

---

## 3. The screens, field by field

### 3.1 List — `/finance/bill/corrections`

`<DataTable>` shape lifted from the HR leave page (§1): columns — correction number, student name, type badge (Credit Note / Refund / Write-off — small dedicated badge, three fixed colors, not the generic `<StatusBadge>`), amount, status badge, requested-by/at. Filter bar: type `<Select>` (`CREDIT_NOTE/REFUND/WRITE_OFF`), status `<Select>` (`REQUESTED/APPROVED/REJECTED`), student search (client-side, matching the leave page's `staffSearch` pattern — `BillCorrectionQueryDto` only filters by exact `studentId`, not a name string, same "match what the backend actually supports" discipline UI-3 §5.1 used for the invoices list).

Row click → detail (§3.3). "+ New Correction" action → §3.2.

Approve/Reject inline actions (owner-gated per §1, `REQUESTED`-only, same conditional-render-by-status pattern as HR's Actions column) open the note dialog (§3.4) rather than firing immediately.

### 3.2 New Correction — `/finance/bill/corrections/new`

**One page, not a dialog** — my default, since the form has real context to show (a student's outstanding invoices, their balance) the way Payment Counter's `/new` page does, not a lightweight toggle like Bill Runs' create-draft dialog. Flag if you'd rather this be a dialog off the list page instead.

Layout:
1. **Type switcher** — three tab/segmented buttons: Credit Note / Refund / Write-off. Determines which fields below render and which `POST` fires on submit (ruling 3 — one flow, not three routes).
2. **Student picker** — `useStudents` search, same component Payment Counter uses. Selecting a student loads:
   - `useStudentOutstandingInvoices(studentId)` — feeds the invoice picker (Credit Note required, Write-off optional).
   - `useStudentBalance(studentId)` — feeds the refund/balance-write-off cap.
3. **Type-specific fields:**
   - **Credit Note:** invoice `<Select>` (required, from outstanding invoices) → **optional** line-item `<Select>` if the invoice has items (flag below); amount; reason `<Select>` (`useCorrectionReasons`, shared list).
   - **Refund:** method `<Select>` (`CASH`/`BANK_TRANSFER`) → reference `<Input>` (required, client + server both enforce, only shown/required for `BANK_TRANSFER`); amount; reason.
   - **Write-off:** invoice `<Select>` — **optional**, an explicit "Whole balance (no specific invoice)" option alongside the student's outstanding invoices; amount; reason.
4. **Cap preview** — a small inline banner computed client-side from data already on the page, labeled "Estimated limit — the amount is re-checked on submit":
   - Credit Note (invoice-level): the selected invoice's `balance` field (already server-computed, UI-4 §2).
   - Credit Note (item-level, if built — see flag): the item's `netAmount`, **not** further reduced by prior corrections against that line — see the flag below for why.
   - Refund: `studentBalance.balance` when `sign === 'ADVANCE'`, else 0 with a "no advance credit available" note.
   - Write-off (invoice-scoped): same as credit-note invoice-level.
   - Write-off (balance-scoped): `studentBalance.balance` when `sign === 'OWES'`, else 0.
   This preview is explicitly a UX guardrail, not the authority — the backend re-validates the real cap (net of prior APPROVED corrections against the same target, `bill-correction.service.ts`'s `creditableAmount`/`availableCredit`/`owedBalance`) at both request time and again at approve time (§1). No new backend endpoint is needed to make the preview *exact* either, so it isn't — flagged, not silently fudged.
5. Submit → the type-appropriate `POST`. On success: toast + route to the new correction's detail page (§3.3) — same "land on the result, not back on the list" pattern Payment Counter uses after recording a payment.

**Line-item credit notes — building this phase (ruling 5).** `CreateCreditNoteDto.targetInvoiceItemId` is optional server-side ("omit for a whole-invoice credit note"). The item picker needs one new thing: a `useBillInvoiceDetail(id)` hook wrapping `billInvoiceApi.get` (§1 — the axios wrapper already exists and was unused, so this is a five-line addition, not new plumbing) to fetch `items[]` once an invoice is selected — an optional second `<Select>` ("Whole invoice" / one row per item) appearing under the invoice picker, Credit Note only. The item-level cap preview nets out prior same-line corrections via an extra `GET /finance/corrections?studentId=&status=APPROVED` fetch, filtered client-side by `targetInvoiceItemId` — the one part of this screen that isn't a straight read of already-fetched data, called only once an item is actually selected (not on every invoice pick).

### 3.3 Detail — `/finance/bill/corrections/[id]`

One page:
1. **Header card** — correction number, type badge, status badge, student (name + link), amount, reason, requested-by/at, decided-by/at + decision note (once decided).
2. **Type-specific context** — target invoice (linked, if any) or refund method/reference.
3. **Ledger entries** — the `ledgerEntries[]` array from `GET /:id` rendered as a small two-column table (date, entry type, debit, credit, narration) — when a reversal exists, both rows show, with the reversal's `reversesEntryId` making the pairing visible (matches how `LedgerEntryResponseDto` is already shaped for exactly this, §1). This is the "credit note reversed, both entries visible" audit trail the backend was built to support.
4. **Actions** — owner-gated (§1 snippet), status-conditional: `REQUESTED` → Approve/Reject (§3.4); `APPROVED` (with a `ledgerEntryId` and no existing reversal) → Reverse (`<ConfirmDialog>`, no note).

### 3.4 Decide dialog — approve / reject (ruling 2, refined)

New `components/finance/decide-correction-dialog.tsx` — **not** `<ConfirmDialog>`. Structurally similar (a `<Dialog>` with a Cancel/Confirm footer) but with a `<Textarea>` for the decision note between the description and the footer. Title/copy differs by action (`Approve credit note {number}?` / `Reject credit note {number}?`), confirm button green for approve / red for reject (matching the leave page's existing button-color convention).

**Note requirement is asymmetric, per the refined ruling:** required client-side on **reject** (submit disabled until non-empty — a refusal needs a real "why" for the requester and the audit trail), **optional** on **approve** (the request's own reason code already carries the "why"; forcing a second one would be friction on the routine case). The DTO itself marks `note` as `@IsOptional()` on both — the reject-side requirement is a UI-level stricter rule, not a backend one.

On submit → `POST /:id/approve` or `/:id/reject` with `{ note }` (omitted/undefined when approve's note is left blank) → toast → refetch the correction (list row updates in place, or detail page re-renders with the decision visible).

### 3.5 Reverse

Plain `<ConfirmDialog>` off the detail page's Reverse button — no note field (the backend endpoint takes none): *"Reverse this {type}? This posts an offsetting ledger entry; the original stays on record."* → `POST /:id/reverse` → detail page refetches, both ledger rows now visible (§3.3).

---

## 4. Status/type badges

- `components/shared/status-badge.tsx` — add one entry: `REQUESTED: 'bg-warning-50 text-warning-700 ...'` (same family as the existing `PENDING` key — a correction sitting unreviewed is the same "needs attention" state HR leave already colors amber).
- New `components/finance/correction-type-badge.tsx` (own component, same precedent as UI-3's `bill-run-outcome-badge.tsx` and UI-4's presumed payment-method badge — a small fixed enum needing its own label/color map): `CREDIT_NOTE` / `REFUND` / `WRITE_OFF` → three distinct, consistent colors (not reusing the status palette, since type and status are orthogonal and both show in the same table row).

---

## 5. Files

**Backend (`UI5-STUDENTNAME-JOIN`, found mid-build — see §1):**
- Modified: `apps/api/src/modules/finance/bill-correction.service.ts` — `findAll`/`findOne` JOIN students + correction_reasons for display names; internal fetches in `approve`/`reject`/`reverse` untouched.
- Modified: `apps/api/src/modules/finance/entities/bill-correction.entity.ts` — `studentName`/`admissionNumber`/`reasonName` optional fields + mapper.
- Modified: `apps/api/src/modules/finance/__tests__/bill-correction.service.spec.ts` — two new cases.

**Web:**
- `apps/web/app/(school)/finance/bill/corrections/page.tsx` — list (§3.1).
- `apps/web/app/(school)/finance/bill/corrections/new/page.tsx` — combined request flow (§3.2).
- `apps/web/app/(school)/finance/bill/corrections/[id]/page.tsx` — detail (§3.3).
- `apps/web/components/finance/decide-correction-dialog.tsx` — approve/reject note dialog (§3.4).
- `apps/web/components/finance/correction-type-badge.tsx` — (§4).
- `apps/web/lib/api/bill-correction.api.ts` — axios wrappers: `requestCreditNote/requestRefund/requestWriteOff/list/get/approve/reject/reverse`, plus `financeSettingsApi.get` (read-only threshold, if not already exposed elsewhere — check before adding, per the ladder).
- `apps/web/lib/hooks/use-bill-correction.ts` — TanStack Query hooks: list/detail/three request mutations/approve/reject/reverse, each invalidating `['bill-corrections']` + the specific `['bill-correction', id]` + (on approve/reject/reverse) `['student-balance', studentId]` and `['bill-invoices', {studentId}]` — same invalidation shape `useRecordPayment` already uses, since corrections move the same balances payments do.
- `apps/web/lib/hooks/use-bill-payment.ts` — **modified**, one addition: `useBillInvoiceDetail(id)` wrapping the already-existing `billInvoiceApi.get` (§3.2 flag), co-located with the file's other `billInvoiceApi` consumer rather than a new file.
- `apps/web/types/api.types.ts` — new `BillCorrection` and `LedgerEntry` types (neither exists on web today — confirmed by grep; BILL-9's student-statement endpoint has no web consumer either, so `LedgerEntry` is genuinely new, not a rename).

**Modified:**
- `apps/web/components/layout/sidebar.tsx` — one new sub-item (§2).
- `apps/web/lib/route-access.ts` — one new row (§2).
- `apps/web/components/shared/status-badge.tsx` — one new key (§4).

---

## 6. Proof approach — and where I'll want your eyeball

**Tier 1 — component/hook tests:** `decide-correction-dialog`'s required-note gating (submit disabled until non-empty, matching how other required-field dialogs in this codebase disable submit); `correction-type-badge` renders the right label/color per type (three cases); cap-preview computation as a pure, unit-testable function per type (mirrors `bill-run-outcome-badge`/`billRunPollInterval`'s "extract the logic, test it standalone" precedent from UI-3).

**Tier 2 — real calls against the running dev backend (`demo` tenant), read back with raw `SELECT`:** request a below-threshold credit note → confirm it shows `APPROVED` immediately with a ledger entry, no approve step needed; request an at/above-threshold credit note → confirm `REQUESTED`, approve it through the real dialog with a note → `SELECT` confirms `decided_by`/`decision_note`/ledger entry; request a refund exceeding available credit → confirm the form or the request surfaces the backend's rejection (not a silent failure); reverse an approved correction → `SELECT` confirms both ledger rows present via the same query `findOne` uses.

**Tier 3 — manual eyeball, two points:**
1. **The New Correction flow (§3.2).** Does the type switcher genuinely feel like "fix something for this student, then pick what fits" (ruling 3's stated goal) rather than three forms wearing a shared header? Does the cap preview read as a helpful guardrail rather than a false promise — i.e., is "Estimated limit — re-checked on submit" honest enough that a stale preview (another write landed between page-load and submit) doesn't read as a bug when the server's real answer differs?
2. **The decide dialog (§3.4).** Does requiring a note on approve (not just reject) feel like the right weight for a money-moving decision, or does it feel like friction on the common case (most approvals will be routine)? This is the one place I made a judgment call beyond your ruling's literal wording ("both for the requester and for audit") — worth confirming before it's built.

No standing Playwright dependency in this repo (confirmed at UI-1) — tier 3 is a real click-through.

---

## Summary

| Question | Answer |
|---|---|
| New backend work | None — every endpoint this phase needs is already live |
| Correction reasons | Already shipped in UI-1, nothing to build |
| Threshold setting | Read-only this phase (cap preview only); edit UI is UI-7 |
| Request flow shape | One page, one type switcher, three `POST`s underneath (ruling 3) |
| Approve/Reject | New note-capturing dialog, not `<ConfirmDialog>` (ruling 2); note required client-side on both actions — flagged for confirmation |
| Reverse | Plain `<ConfirmDialog>`, no note (matches the backend, which takes none) |
| Cap preview | Client-side, built from data already on the page (invoice `balance`, student `balance`+`sign`) — explicitly non-authoritative, backend re-validates at request and approve time |
| Line-item credit notes | Cheap to add (wrapper already exists, needs one small hook) — my default is to build it, flagged since it adds a form step |
| Parent view | Out of scope this phase (ruling 4) — backend scoping stays live, unused |
| Eyeball points | (1) New Correction flow — does the type-switcher framing land, is the cap-preview honesty clear; (2) Decide dialog — is a required note on *approve* (not just reject) the right call |
