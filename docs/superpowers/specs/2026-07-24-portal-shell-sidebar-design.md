# WEB-P Portal Shell UI/UX Pass — Sidebar Parity + Parent Content Fixes

> 2026-07-24 — Interstitial UI/UX pass on `apps/web`'s student/parent/teacher portal
> (`PortalShell`), between WEB-P Phase 5 (Parent module, merged-pending) and Phase 6
> (teacher login cutover). Not a numbered WEB-P phase in `docs/web/WEB-P-PORTAL.md` —
> a follow-up polish pass on shipped phases, not new feature scope.

---

## 1. Problem Statement

Srijan did a manual click-through of all 7 parent screens (`feat/web-p-phase-5-parent`,
tip `67267c7`) and reported the UI/UX is broken relative to the admin panel
(`SchoolShell`). Concrete complaints, gathered before any code was touched:

1. **Top nav bar wraps/crowds.** `PortalShell` (`apps/web/components/layout/
   portal-shell.tsx`) renders one sticky header with nav links inline as a flat
   `flex-wrap` row next to the logo. Parent alone now has 7 links
   (`PARENT_NAV_ITEMS`) plus `ChildSwitcher`, an EN/नेपाली toggle, a role pill, and
   a plain-text "Sign out" button all fighting for space in one bar.
2. **`ChildSwitcher` dropdown doesn't fit long names.** `SelectTrigger` in
   `apps/web/components/parent/child-switcher.tsx` is a hardcoded `w-48` with no
   truncation handling — a longer child name overflows or gets clipped mid-character.
3. **No collapsible sidebar**, unlike the admin `SchoolShell` +
   `components/layout/sidebar.tsx` (290px expanded / 90px collapsed, hover-to-expand,
   role-filtered grouped nav with icons).
4. **Attendance calendar is oversized.** `apps/web/app/(portal)/parent/attendance/
   page.tsx` renders a `grid-cols-7` BS-month grid with `aspect-square w-full` day
   cells inside a card with **no max-width constraint** — cell size scales with the
   full `max-w-screen-2xl` page width, ballooning on wide desktops (worse without a
   sidebar consuming horizontal space).
5. **Empty space on most pages.** E.g. the same attendance page's leave-request
   `<form>` is capped `max-w-lg` but sits inside a full-width card, wasting the right
   two-thirds of the row on wide screens; the month-nav bar is a few buttons spread
   across a full-width `justify-between` row.

Root cause (confirmed by reading both shells): `PortalShell` was built in WEB-P
Phase 1 as a deliberate skeleton-phase simplification of `SchoolShell` — explicitly
documented in its own header comment as mirroring the auth-gating/`canAccess`
pattern **without** the admin's collapsible-sidebar machinery, since Phase 1 had one
nav link and Phases 2–4 had 3–4. That trade-off stopped paying off once Phase 5 gave
Parent 7 links plus a stateful child switcher.

## 2. Scope

- **Shell/sidebar fix applies to all three portal roles** (student, parent,
  teacher) — they share `PortalShell`, so this is structural, not per-role.
- **Page-content fixes (calendar sizing, empty-space/whitespace, form width)
  are scoped to the 7 parent screens only**, per Srijan's explicit call — those
  are the only screens actually reviewed and confirmed broken. Student/teacher
  content gets its own review later, once someone has actually clicked through
  them (not guessed at from the parent findings).
- **Explicitly out of scope:** any change to data-fetching, hooks, or the
  IDOR-verified backend calls behind the 7 parent screens (Phase 5's whole-branch
  review + `docs/web/phase-5-idor-audit.md` already verified that logic). This is
  shell/layout/visual treatment only.
- No backend files touched.

## 3. Architecture — the sidebar decision

Three options were considered for how `PortalShell` gets a real collapsible
sidebar:

- **(A) Parameterize the existing admin `Sidebar`** to accept nav items/config
  and serve both shells. Rejected: `Sidebar.tsx` has admin-only concerns baked
  in (10-group nav with collapsible sub-items, `useOnboardingStatus()` +
  "Setup" entry, `allowedNavItems()` filtered against admin `ROUTE_ACCESS`,
  hardcoded `/dashboard` logo link). Portal nav is flat — no sub-items exist in
  any of `TEACHER_NAV_ITEMS`/`STUDENT_NAV_ITEMS`/`PARENT_NAV_ITEMS` — so most of
  that machinery would be dead weight. Editing this file also means touching
  the one component backing the already-shipped, real-school-admin-facing
  shell for a portal-only ask — the highest-stakes file to risk regressing.
- **(B) New parallel `PortalSidebar` component** — chosen. Reuses the already-
  global `SidebarContext` (provided in `apps/web/app/providers.tsx`, not
  admin-scoped) and the same `menu-item*` / `menu-dropdown-item*` CSS utility
  classes (plain `@utility` definitions in `globals.css`, not component-scoped)
  for pixel-level visual parity, with its own simple flat-list nav rendering
  (no sub-items, no onboarding). Zero risk to `SchoolShell`/`Sidebar.tsx`.
- **(C) Extract a shared presentational `<SidebarShell>` base** consumed by
  both a slimmed-down admin wrapper and a new portal wrapper. The "proper" DRY
  answer, but requires refactoring the already-reviewed, production admin
  `Sidebar.tsx` in place — real risk to the admin surface for a payoff
  (avoiding hypothetical future visual drift) that may never materialize.

**Decision: (B).** Confirmed with Srijan. This is also not a new pattern for
this codebase — `apps/web/components/layout/super-admin-sidebar.tsx` is
*already* an independent sidebar component built exactly this way: its own
flat `NavItem`/`NavGroup` types (no sub-item collapse machinery), its own icon
set, reusing `useSidebar()` from the same shared context, styled differently
(dark) from the admin `Sidebar` it sits alongside. Three sidebars sharing one
context, each owning its own nav/visual specifics, is the established shape of
this codebase, not a new risk being introduced.

## 4. Components

### 4.1 `PortalSidebar` (new — `apps/web/components/layout/portal-sidebar.tsx`)

- Reuses `useSidebar()` (`isExpanded`/`isMobileOpen`/`isHovered`/`setIsHovered`)
  — no new context plumbing needed.
- Reuses `useTenantStore()` for the logo/name block exactly as admin `Sidebar`
  does today (tenant logo swap logic has no admin-only dependency).
- Logo links to the role's home route (`/parent`, `/student`, `/teacher`)
  instead of admin's hardcoded `/dashboard`.
- Nav rendering: flat list per role, reusing the existing
  `TEACHER_NAV_ITEMS`/`STUDENT_NAV_ITEMS`/`PARENT_NAV_ITEMS` arrays (moved from
  `portal-shell.tsx` into the new file, each entry gaining a Lucide `icon`
  field), rendered with the same `menu-item`/`menu-item-active`/
  `menu-item-icon-*` CSS utility classes the admin sidebar uses — no sub-menu
  toggle/height-measurement logic needed (no sub-items exist for any role).
- No "Setup"/onboarding entry (not applicable to these roles).
- Keeps the "Powered by Aaramva Shikshya" footer block for brand consistency
  (self-contained JSX using `/logo.png`, no admin-only dependency).
- Width/collapse breakpoints identical to admin `Sidebar` (290px / 90px,
  hover-to-expand, mobile off-canvas) for visual parity.

### 4.2 Shared `Backdrop` extraction

`SchoolShell` currently defines the mobile-overlay `Backdrop` as a private,
unexported function with zero admin-specific logic (reads `useSidebar()`,
renders a fixed click-to-close overlay). Extract it to
`apps/web/components/layout/sidebar-backdrop.tsx` and have both `SchoolShell`
and the new `PortalShell` import it. This is a 1-line-diff in `school-shell.tsx`
(swap the inline function for an import) — mechanical, no behavior change, low
risk — not a broader refactor of anything admin-specific.

### 4.3 `PortalShell` restructure

- Layout shape changes to mirror `SchoolShell`'s: `flex h-screen overflow-hidden`
  wrapping `<PortalSidebar />`, `<Backdrop />`, and a margin-shifted content
  column (`ml-0` / `lg:ml-[290px]` / `lg:ml-[90px]` per sidebar state — same
  ternary `SchoolShell` already uses).
- All existing gating effects (`isInitialized`/`accessToken` redirect,
  `mustChangePassword` redirect, the loader-until-hydrated guard, `canAccess`/
  `AccessDenied` rendering) are preserved unchanged — this pass touches layout
  only, not auth/access logic.
- Nav items move out of the header entirely (now live in `PortalSidebar`).

### 4.4 New `PortalHeader` (new — `apps/web/components/layout/portal-header.tsx`)

Slim bar mirroring admin `Header.tsx`'s shape:

- **Left:** sidebar-toggle button (same hamburger icon/behavior as admin,
  `toggleSidebar` on desktop / `toggleMobileSidebar` on mobile) + mobile-only
  logo (shown only when the sidebar is off-canvas on small screens).
- **Right:** `ChildSwitcher` (parent role only) → EN/नेपाली language toggle
  (unchanged behavior, `useLocaleStore`) → a consolidated user-menu dropdown
  (avatar initials, display name, role label, sign-out), replacing today's
  separate role-pill badge + bare "Sign out" text button.
- **Must preserve:** the user-menu's role label uses the local `ROLE_LABELS`
  constant (`STUDENT`/`PARENT`/`TEACHER` → display string) already defined in
  `portal-shell.tsx` — **not** admin's `useRoleLabels()` hook. That hook calls a
  `TEACHER_AND_ABOVE`-gated HR endpoint that would 403 for STUDENT/PARENT; this
  was a deliberate, documented WEB-P Phase 1 decision and must not be
  regressed by copying admin's `UserMenu` verbatim.
- No search bar, no notification bell — neither exists in the portal today
  (no `/communication/notifications`-equivalent route in any portal nav) and
  adding one is new feature scope, not layout polish. Out of scope here.

### 4.5 `ChildSwitcher` fix

- Widen `SelectTrigger` from the hardcoded `w-48` to a responsive width (e.g.
  `w-56 sm:w-64`, capped with a sane `max-w-*`).
- Add `truncate` + a `title` attribute (full name) on: the trigger's computed
  name span, the single-child plain-label case, and each `SelectItem` row
  (which also appends enrollment info and can overflow independently of the
  trigger). Matches the `truncation-strategy` UX guideline (prefer wrapping;
  when truncating, keep the full value reachable via tooltip) rather than
  silently clipping or overflowing.
- Fix applies regardless of header crowding — robust on its own, though moving
  nav out of the header also gives it more natural room.

## 5. Parent page-content fixes

### 5.1 Attendance calendar (clearest, most concrete instance)

- Cap the calendar grid's container width (e.g. `max-w-[560px]`) instead of
  letting `aspect-square` cells scale with the full `max-w-screen-2xl` page.
- Use the freed horizontal space purposefully: at `xl:` breakpoints, lay the
  calendar (+ legend) and the (stat card + leave-request form) side-by-side
  instead of fully stacked full-width blocks, falling back to the current
  stacked layout below `xl:`. This directly answers both the "calendar too
  big" and "empty space" complaints on the same screen with one layout change.
- No change to the data-fetching, BS-month math, or TZ-safe date handling in
  this file — visual/layout only.

### 5.2 Remaining 6 parent screens (dashboard, notices, results, assignments,
fees, timetable)

Not enumerated here — a page-by-page empty-space/spacing audit is an early
task in the implementation plan, not a guess baked into this design doc.
General principle to apply during that audit: prefer purposeful multi-column
layouts on wide viewports over single-column full-bleed stacks; cap
oversized elements (like the calendar) rather than letting them scale
unbounded with the page container.

## 6. Explicitly preserved (must not regress)

- Async-gate guard behavior across all 7 screens (the `!value || isLoading`
  pattern this project has been bitten by before — Phase 5's whole-branch
  review already covers this; this pass must not touch the guard conditions,
  only surrounding JSX/layout).
- `useSelectedChild()`'s self-healing re-pick behavior (whole-branch review
  fix, commit `0bd15fb`) — not touched by a layout pass, but re-verified after
  the rework since `ChildSwitcher` and the attendance page are both directly
  edited here.
- All IDOR-verified backend calls (`docs/web/phase-5-idor-audit.md`) — no
  hook, API client, or query key changes anywhere in this pass.
- `mustChangePassword` redirect, `canAccess`/`AccessDenied` gating, and the
  hydration loader in `PortalShell` — carried over unchanged into the
  restructured layout.

## 7. Verification plan

- `npx tsc --noEmit` clean (web).
- Full web test suite passing (baseline: 320 tests per Phase 5).
- Manual re-check of the async-gate guards and `useSelectedChild()` self-heal
  behavior on the reworked attendance/dashboard screens (per §6) — not a new
  automated test, since Phase 5 already covers the hook itself; this is
  re-verifying the surrounding layout change didn't disturb the render paths
  that depend on it.
- Visual check across the sidebar's expanded/collapsed/mobile-drawer states
  for all three roles (student/parent/teacher), confirming nav-item sets
  still match `TEACHER_NAV_ITEMS`/`STUDENT_NAV_ITEMS`/`PARENT_NAV_ITEMS`
  exactly (no accidental addition/removal of a route during the move into
  `PortalSidebar`).
- Confirm `ChildSwitcher` renders correctly for: zero children (hidden), one
  child (plain label), and 2+ children (dropdown, including a crafted
  long-name case) — no live data changes needed, existing demo/family fixtures
  from Phase 5's IDOR audit cover multi-child accounts.

## 8. Non-goals

- No student/teacher screen content changes (§2).
- No new features (notification bell, search, etc.) beyond what's needed to
  reach visual/structural parity with the admin shell.
- No backend changes.
- No change to `docs/web/WEB-P-PORTAL.md`'s phase numbering — this is
  recorded as a standalone spec, not inserted as a renumbered phase, since
  it's a polish pass on already-shipped phases rather than new scope.
