# UI-1-SPEC — Fee Catalog admin screens

**Target path in repo:** `docs/api-contracts/UI-1-SPEC.md`
**Branch (not yet created):** `feat/ui-1-catalog`
**Depends on:** BILL-0–9 (all merged, backend complete), `docs/api-contracts/BILL-ADMIN-UI-discovery.md` (approved) and `PAY-UI-REPOINT-discovery.md`.
**Covers:** the seven fee-catalog sub-resources — fee heads, fee structures (+items), discount reasons, correction reasons, transport routes, tax rates, late-fee rules. First of seven phases (Catalog → Assignment → Bill Runs → Payment Counter → Corrections → Reports → Settings).
**Status:** Spec only. Not built. Stop point: Srijan reviews and rules on the flagged design decisions (§3, §7) before any code is written.

---

## 0. What this phase does and does not do

**Does:** ship a real, usable admin screen for the seven catalog sub-resources listed above, wired to already-live backend endpoints (nothing new on the backend this phase). Sets the URL/nav structure the other six phases inherit. Sets the visual language — this is the first BILL-rail screen to exist, so its choices become precedent.

**Does not:** touch assignment, bill runs, payments, corrections, reports, or settings (later phases). Does not touch the old-rail finance pages (`/finance`, `/finance/invoices`, `/finance/fee-structures`, `/finance/reports`) — they stay exactly as they are, per the discovery report's confirmed stance. Does not fix the pre-existing dark-mode card bug found during this spec's own research (§2) — flagged, not fixed, out of scope.

---

## 1. What already exists — read directly, not assumed

All seven backend sub-resources already have full CRUD, live, on `BillCatalogController` (`@Controller('finance')`, routes `fee-heads`, `discount-reasons`, `correction-reasons`, `transport-routes`, `tax-rates`, `late-fee-rules`, `bill/fee-structures(+items)`), gated `ACCOUNTANT_AND_ABOVE` read/write, `OWNER_ONLY` delete (soft delete). Every DTO and response shape below was read directly from `apps/api/src/modules/finance/dto/*.dto.ts` and `entities/bill-catalog.entity.ts`, not inferred.

**A real, load-bearing pattern found while confirming "not TailAdmin" more carefully (worth stating precisely, since it directly affects §2):** `apps/web` has no `tailadmin` npm dependency (confirmed, unchanged from the prior discovery report), but its entire color/shadow/typography vocabulary — `brand-*`, `stroke`/`strokedark`/`boxdark`/`meta-4`/`title-*` — was produced by literally cloning TailAdmin's component and Tailwind-config source into this repo (`docs/api-contracts/18-tailadmin-migration.md`, "Session 18 — TailAdmin UI Migration"). Both things are true at once: no package dependency, but yes, TailAdmin *is* the literal origin of the look. That's the more complete answer to "what's the design language."

---

## 2. Design language — a known issue found during this spec's own research

`apps/web/app/globals.css` carries its own dated, in-place comment (added when Tailwind v4 dropped `tailwind.config.js` and these legacy TailAdmin tokens had to be manually restored as CSS custom properties, 2026-07-16):

> `dark:bg-boxdark` (32 files) — **the bad one:** those cards pair it with `bg-white`, so in dark mode the card stays WHITE while `dark:text-white` applies on top = **white text on a white card.**

This is real, live, and currently affects 32 existing files. `next-themes` is wired app-wide (`app/providers.tsx`) with no explicit toggle found in the layout — meaning a user's OS-level dark-mode preference can trigger it right now, on the existing app, without anyone touching a switch.

**What this means for UI-1, concretely:**
- The new catalog page must **never** pair `bg-white` with `dark:bg-boxdark` on the same element — pick one consistent card treatment and use it everywhere in this phase's own files. (Trivial to avoid; the existing bug is a leftover pairing mistake, not a hard constraint on which tokens are usable.)
- Every new screen in this phase gets checked in **both** light and dark mode before sign-off — not just light, which is what "looks fine" would otherwise silently mean. Flagged as an eyeball point in §7.
- Fixing the 32 pre-existing files is explicitly **out of scope** for this phase. Noting it here so it isn't rediscovered as a surprise later — it's a real, separate cleanup item.

---

## 3. Route, nav, and page-shape decisions — flagged for Srijan's eyeball, not decided unilaterally

**Proposed URL:** `/finance/bill/catalog` — mirrors the backend's own `/finance/bill/...` split exactly, and avoids the identical collision the backend already solved once (`BUGS-3`: the old rail already owns `/finance/fee-structures`; a new page can't reuse that path).

**Proposed nav placement — this is the actual decision to eyeball:** add one new sub-item, "Fee Catalog," to the *existing* "Finance" sidebar dropdown (which today has Overview / Invoices / Fee Structures / Reports, all old-rail), rather than creating a new top-level "Billing" section. Reasoning: it's the same domain from a school's perspective, and adding a second top-level finance-shaped nav entry risks reading as two unrelated products. **The open question this raises, genuinely undecided here:** does mixing old-rail and new-rail links under one dropdown read as confusing to a real accountant who doesn't know (and shouldn't need to know) that they're different tables under the hood? A visual separator or section label inside the dropdown is one mitigation; a distinct "Billing" top-level group is the alternative. **This choice sets precedent for all six later phases' nav entries — asking for a real decision here, not a rubber stamp.**

**Proposed page shape:** one page (`app/(school)/finance/bill/catalog/page.tsx`), tabbed — matching the **HR Setup page's actual precedent exactly**, which is a hand-rolled `TABS` array + button-bar (`border-b-2` active-state styling), **not** `components/ui/tabs.tsx`'s shadcn `<Tabs>` primitive, even though that primitive exists and is used elsewhere. Following what this codebase's own prior multi-resource-CRUD page actually did, not inventing a new tab mechanism.

**Tab order (proposed, matches setup dependency order an accountant would actually work in):** Fee Heads → Fee Structures → Discount Reasons → Correction Reasons → Transport Routes → Tax Rates → Late Fee Rules. Heads first because Structures and Late Fee Rules both reference them; the three standalone lookups (Discount/Correction Reasons, Transport Routes) in the middle; Tax Rates and Late Fee Rules last as the least-frequently-touched, most consequential settings.

**Seven tabs is more than HR Setup's five — flagged as an eyeball point (§7):** does the hand-rolled button-bar wrap awkwardly at seven tabs on a narrower viewport? Not knowable from reading code alone.

---

## 4. The DRY move this phase makes: promoting `ConfigSection`/`ConfigRow`

`hr/setup/page.tsx` defines `ConfigSection` and `ConfigRow` as **local, unexported** components — the exact "list + inline add-row + inline edit-row" shape six of this phase's seven tabs need (see §5). Rather than a second copy-paste of the same ~90 lines, this phase promotes them to `components/shared/config-section.tsx` and updates `hr/setup/page.tsx` to import from there instead of its own local copy — a small, behavior-preserving extraction (HR Setup's own existing tests re-run unchanged as the regression proof). This follows the same "reuse-not-reimplement" discipline already visible throughout this codebase's own history, and means the *next* phase that needs a simple lookup-table CRUD tab (there will be more) has a real shared component to reach for instead of a third copy.

---

## 5. The seven tabs, field by field

**General pattern for six of the seven (all except Fee Structures):** the promoted `ConfigSection`/`ConfigRow` inline-row style from §4 — an "add" row at the top, existing rows below with inline edit-in-place, no separate create/edit page, no dialog. Plain `useState`, not React Hook Form — matches HR Setup's own choice for entities this simple (2-8 flat fields, no nested arrays), not the heavier RHF+Zod machinery reserved for genuinely complex forms elsewhere in this app (student admission, and Fee Structures below).

### 5.1 Fee Heads
- Fields: `name` (text, ≤100), `code` (text, ≤30), `recurrence` (select: MONTHLY/QUARTERLY/TERM/ANNUAL/ONE_TIME/ON_DEMAND), `isTaxable` (checkbox), `isRefundable` (checkbox), `prorationPolicy` (select: NONE/MONTHLY), `glAccountCode` (optional text), `displayOrder` (optional number).
- Row display: name, code, recurrence badge, taxable badge, active badge.
- Delete: OWNER_ONLY (soft delete) — action hidden client-side for non-owner viewers, matching the existing convention of role-gating actions in the UI in addition to the backend's own 403.

### 5.2 Fee Structures — the one tab that isn't the inline-row shape
Genuinely different: it has a one-to-many `items[]` array (`feeHeadId` + `amount` + optional `recurrenceOverride` + `effectiveFrom`/`effectiveTo` per item), and the edit endpoint (`PATCH .../items`) only ever replaces the *items*, never `classId`/`academicYearId`/`name` (those are fixed at creation — confirmed directly from `UpdateBillFeeStructureItemsDto` only accepting `items`).

**Follows the OLD rail's own precedent almost exactly** (`components/finance/fee-structure-form.tsx`, already in this codebase, already solving this same shape) rather than inventing a new pattern: a `Dialog` (not a page), React Hook Form + `zodResolver` + `useFieldArray` for the item rows, add/remove-row buttons. New file `components/finance/bill-fee-structure-dialog.tsx`, schema `lib/schemas/bill-fee-structure.schema.ts` (a real file, not inline, since this dialog serves both create and items-only-edit modes and benefits from one shared schema between them).
- Create fields: `academicYearId` (select, reuses existing `useAcademicYears`), `classId` (select, reuses existing `useClasses`), `sectionId` (optional select — reuses whichever section-by-class hook the academic module already has), `name` (text, ≤200), `items[]`.
- Edit: opens the same dialog with `academicYearId`/`classId`/`name` shown **read-only** for context (they can't change), `items[]` editable.
- List: `DataTable` (not inline rows — this list benefits from the search/pagination `DataTable` already provides, same reasoning as the `students` list), columns: Name, Class, Academic Year, Section (or "All"), item count, Active.
- Delete: OWNER_ONLY.

### 5.3 Discount Reasons
- Fields: `name` (≤100), `code` (≤30), `glAccountCode` (optional). Inline-row shape.
- Row display: name, code, active.

### 5.4 Correction Reasons
- Identical field shape to Discount Reasons — confirmed directly from the DTOs (BILL-6 built it "same shape by design, different domain"). Same tab treatment, separate tab (they're genuinely different lookups on the backend, never merged).

### 5.5 Transport Routes
- Fields: `name` (≤100), `code` (≤30), `monthlyAmount` (money input — `@IsMoneyString()` on the backend, so the input must produce a decimal string, not a raw number, matching the money-input convention already used elsewhere). Inline-row shape (3 fields, same complexity tier as HR Setup's own "Leave Types" tab).
- Row display: name, code, monthly amount, active.

### 5.6 Tax Rates
- Create fields: `name` (≤100), `rate` (**plain number, 0–100, up to 3dp — not a money input**; the DTO's own comment explains why: `NUMERIC(5,3)` is a percentage rate, and `@IsMoneyString()` is hardcoded to 2dp and would reject a genuine 3dp rate), `appliesTo` (select: ALL/TAXABLE_HEADS, optional, defaults ALL), `effectiveFrom` (`BsDateInput`, per this app's own "always BS for date entry" rule even though the column stores AD), `effectiveTo` (optional, same).
- **Edit is deliberately narrower than create — call this out in the UI copy, not just enforce it silently:** `rate` and `appliesTo` are immutable after creation (confirmed: `UpdateTaxRateDto` only accepts `name`/`effectiveFrom`/`effectiveTo`). A tax rate that's been applied to real invoices must never have its rate value quietly change underneath them — the way to "change" a rate going forward is creating a new row, not editing the old one. The edit form should show `rate`/`appliesTo` read-only with a one-line explanation, not just omit the fields with no context.
- Row display: name, rate, applies-to, effective range, and a **computed** "Active" badge (today within `[effectiveFrom, effectiveTo]`) — there is no stored `isActive` column for this resource, confirmed directly from the query DTO's own comment ("`isActive` for a tax rate isn't a stored flag").

### 5.7 Late Fee Rules
- Fields: `scope` (select GLOBAL/FEE_HEAD), `feeHeadId` (**conditional** — shown only when `scope=FEE_HEAD`, options from the Fee Heads tab's own data, same "conditional select tied to a sibling dropdown" shape HR Setup's own Designations tab already uses for its optional department picker), `type` (select FLAT/PER_DAY/PERCENT), `value` (money input, its label changes with `type`: "Flat amount" / "Amount per day" / "Percent of outstanding"), `graceDays` (number, default 0), `capAmount` (optional money input), `isEnabled` (checkbox, **defaults off**), `effectiveFrom`/`effectiveTo` (`BsDateInput`).
- **The `isEnabled` default and its copy matter — this isn't just a checkbox.** BILL-7's own governing rule (B7-4) is "no tenant gets surprise fines" — ships disabled per tenant by design. The create form should make turning it on read as a real, deliberate decision (a short inline note next to the toggle, not just a bare checkbox), matching the seriousness the backend spec itself gave this. Flagged in §7 as a copy/tone judgment call, not a mechanical field.
- Edit: `scope`/`feeHeadId`/`type` are locked after creation (confirmed: `UpdateLateFeeRuleDto` only accepts `value`/`graceDays`/`capAmount`/`isEnabled`/dates) — same read-only-with-context treatment as Tax Rates' `rate`.
- Row display: scope, fee head (if scoped), type, value, grace days, cap, an **Enabled** badge (green/gray, prominent — this is the one row-level fact most worth seeing at a glance, given B7-4), effective range.

---

## 6. Files

**New:**
- `apps/web/app/(school)/finance/bill/catalog/page.tsx` — the tabbed page.
- `apps/web/components/shared/config-section.tsx` — `ConfigSection`/`ConfigRow`, promoted from `hr/setup/page.tsx` (§4).
- `apps/web/components/finance/bill-fee-structure-dialog.tsx` — the one Dialog+`useFieldArray` form (§5.2).
- `apps/web/lib/api/bill-catalog.api.ts` — one axios wrapper module, all seven sub-resources, grouped with comment headers mirroring `bill-catalog.controller.ts`'s own section order.
- `apps/web/lib/hooks/use-bill-catalog.ts` — TanStack Query hooks (list/create/update/delete × 7 = 28 hooks), same shape as `use-students.ts`.
- `apps/web/lib/schemas/bill-fee-structure.schema.ts` — Zod schema for §5.2's dialog only; the other six tabs need no schema file (plain `useState`, matching §5's general pattern).

**Modified:**
- `apps/web/app/(school)/hr/setup/page.tsx` — import `ConfigSection`/`ConfigRow` from the new shared location instead of its own local definitions (behavior-preserving).
- `apps/web/components/layout/sidebar.tsx` — one new sub-item under "Finance" (§3, pending Srijan's ruling on placement).
- `apps/web/lib/route-access.ts` — one new `ROUTE_ACCESS` row, `{ prefix: '/finance/bill/catalog', roles: ACCOUNTANT_AND_ABOVE, endpoint: 'GET /finance/fee-heads' }` (SEC-2 parity, matching the existing citation-comment convention).
- `apps/web/types/api.types.ts` — seven new response-DTO interfaces, ported directly from `entities/bill-catalog.entity.ts` (already read in full in §1 — no guessing needed at build time).

---

## 7. Proof approach — the three tiers, and exactly where Srijan's eyeball is needed

**Tier 1 — component/hook tests (vitest + testing-library, jsdom):** `use-bill-catalog.test.tsx` mirrors `use-students.test.tsx`'s existing shape — query-key correctness, mutation success invalidating the right query, the conditional `feeHeadId` field's visibility logic in the Late Fee Rules row, the Tax Rate / Late Fee Rule read-only-on-edit field-locking behavior (§5.6/5.7) pinned as a real test, not just a description in this spec.

**Tier 2 — real calls against the running dev backend:** `npm run start:dev` + `demo` tenant, the actual web app pointed at it, real form submissions producing real `fee_heads`/`bill_fee_structures`/etc. rows, verified with raw `SELECT` read-backs — same discipline as every BILL-x backend checkpoint, reached through the browser this time. Covers all seven tabs' create/edit/delete paths, role-gating (ACCOUNTANT can create, only OWNER sees/can hit delete), and the Fee Structures dialog's full items-array round trip.

**Tier 3 — manual eyeball, and this is the explicit list Srijan asked for:**
1. **§3's nav placement decision** — does "Fee Catalog" nested under the existing Finance dropdown read as coherent next to the old-rail links, or does it need a visual separator / its own top-level section? This is a real open question, not a formality.
2. **Both light and dark mode**, on every new screen in this phase (§2) — confirm none of this phase's own new files reproduce the existing `bg-white`/`dark:bg-boxdark` pairing bug.
3. **Seven tabs in the hand-rolled button-bar** (§3) — does it wrap or crowd at realistic viewport widths, given HR Setup's own precedent only had five.
4. **The Fee Structures dialog's row add/remove interaction** (§5.2) — the one genuinely more complex screen this phase ships; does the items-array UX feel right in practice, not just on paper.
5. **The Late Fee Rules "ships disabled" copy** (§5.7) — a tone/seriousness judgment call (does the enable-toggle read as consequential enough), not something a test can verify.

No standing Playwright dependency exists in this repo (confirmed in the prior discovery report) — tier 3 above is a real human click-through, not scripted automation, unless a browser-automation tool happens to be available to whichever session builds this.

---

## Summary

| Question | Answer |
|---|---|
| New backend work | None — all seven sub-resources' CRUD already live |
| New route | `/finance/bill/catalog`, one tabbed page |
| Tab mechanism | Hand-rolled button-bar (HR Setup precedent), not shadcn `<Tabs>` |
| 6 of 7 tabs | Inline `ConfigSection`/`ConfigRow` (promoted to `components/shared/`) |
| Fee Structures tab | Dialog + RHF + `useFieldArray`, mirroring the old rail's own `fee-structure-form.tsx` |
| Known issue found | Pre-existing dark-mode card bug (32 files) — avoided in new files, not fixed |
| Decisions needing Srijan's ruling | Nav placement (Finance dropdown vs new Billing section); five explicit eyeball points in §7 |
