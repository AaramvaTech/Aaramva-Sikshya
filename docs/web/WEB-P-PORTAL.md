# WEB-P — Student/Parent/Teacher Web Portal

**Status:** Spec locked, ready for Phase 1 build prompt
**Save to:** `docs/web/WEB-P-PORTAL.md`
**Depends on:** ERR-1 (merged), DEPLOY-1 (live)
**Supersedes:** Teacher access to the admin portal (hard cutover — see §7)

---

## 1. Goal

Extend `apps/web` with role-scoped portals for **student**, **parent**, and **teacher**,
matching (and in some cases exceeding) the feature set of the mobile app, with
desktop-optimized UX rather than a faithful mobile port. Teachers currently
authenticate through the admin portal; this migrates them fully to the new
portal and removes teacher access from admin.

## 2. Architecture

- **Extend `apps/web`** — new route group(s) alongside the existing `(school)`
  admin area and `(auth)` group. Not a separate app/deploy target.
- Reuses existing infra for free: `BrandingScript`/`BrandingSync` (per-tenant
  theming applies automatically to any new route group), httpOnly cookie auth,
  `X-Tenant-Slug` handling, `getErrorDisplay` contract.
- **Role gating is frontend-only today** (`route-access.ts` / `canAccess()`) —
  backend login is already role-agnostic, so STUDENT/PARENT can authenticate
  via the existing cookie flow with zero backend auth changes. New
  `ROUTE_ACCESS` rows + a `homeRoute` case + new route groups are required.
  **Reviewer note carried into every phase:** since the block is UI-only, every
  new student/parent-facing backend endpoint must independently carry correct
  `@Roles()` — there is no auth-layer safety net.

## 3. Roles & scope for v1

| Role | Scope |
|---|---|
| **Teacher** | Full write-op parity with mobile, **plus** net-new: assignment creation/publish/review, HR self-service (own leave, profile, timetable, payroll slips), fixed versions of the 4 pre-existing 403 bugs (see §6) |
| **Parent** | Attendance, fees (view-only), leave request for child, notices (read), results+PDF, timetable, assignment view, child-switcher (dropdown **and** side-by-side comparison) |
| **Student** | Dashboard, attendance calendar, timetable, notices, results+PDF, assignment view+submission. **No fee view in v1** (STUDENT has zero finance API access today — backend work needed, explicitly deferred) |

## 4. Locked decisions

- **Payments:** view-only in v1. eSewa/Khalti checkout deferred to a later phase.
  - **Explicit exclusion:** `GET /finance/payments/{esewa|khalti}/status/:transactionUuid`
    looks like a safe read but is side-effecting (can finalize/credit a stuck
    transaction) — must NOT be wired into any view-only screen despite being a GET.
  - Safe to use: `GET /finance/students/:studentId/assignments`,
    `GET /finance/reports/student/:studentId`, `GET /finance/payment-gateways`.
  - No single-invoice-detail endpoint exists for parents — render invoice detail
    from the array already returned by the ledger/report endpoint.
- **Language:** English default, Nepali toggle. **Greenfield** — no i18n
  infrastructure exists on web today. Mobile's i18next locale JSON files can be
  reused as translation *content* source, not as shared code.
- **Devanagari font:** none loaded on web today (Outfit/Latin only via
  `next/font/google`). Needs to be added — recommend Noto Sans Devanagari
  paired with Outfit, confirmed against `NpText` usage.
- **Sessions:** confirmed safe for concurrent mobile + web login — no
  per-user uniqueness constraint on `refresh_tokens`. **One caveat to surface
  in UX:** `changePassword`/`resetPassword` does a global
  `DELETE FROM refresh_tokens WHERE user_id = $1` — changing password on the
  new portal will also log the user out of mobile. Password-change screen
  copy must say this explicitly.
- **Data layer:** adapter approach, not a `packages/shared` refactor (see §5).
- **Assignment creation:** in scope for v1, net-new (mobile is deliberately
  view/review-only for teachers — code-comment-verified).
- **Pre-existing TEACHER 403 bugs:** fixed as part of WEB-P, not carried
  forward (see §6).
- **Teacher HR self-service:** in scope for v1 — fully built on the backend,
  currently has no UI anywhere (own leave, own profile, own timetable, own
  payroll slips).
- **STUDENT finance access:** explicitly out of scope for v1. Parent-only fee
  view stands. Revisit if/when backend finance endpoints are extended to STUDENT.

## 5. Data layer strategy

- **No `packages/shared` refactor for WEB-P.** It was documented but never
  built; building it now would mean refactoring existing working code
  (mobile + web admin) inside a project that's already taking on net-new
  scope (assignment creation, HR self-service, 403 fixes). Deferred as its
  own future backlog item, separate from WEB-P.
- **New portal gets its own API client/hooks**, following the pattern
  `apps/web`'s existing admin layer already uses (cookie-based, matching
  mobile's behavior/endpoints where relevant) — not a port of mobile's
  header-token hooks, which don't fit the cookie auth model.
- **One contained exception, done now:** de-fork `bs-calendar`. Point
  `apps/web` at `packages/bs-calendar` instead of its vendored copy
  (`apps/web/lib/bs-calendar/`). Mechanical, low-risk, and prevents the
  documented FIX-3 date-bug fix from silently not applying to half the app.
  This should happen early (Phase 1 or as a standalone prerequisite PR)
  since later BS date work in the portal should build on the real package.

## 6. Pre-existing TEACHER 403 bugs (fix as part of WEB-P)

These are current admin-portal bugs, not migration-caused, but teachers
should come out of this migration with *more* than they had, not the same
broken experience relocated:

- Dashboard: 2 of 4 widgets 403 for TEACHER (overview/activity are
  `PRINCIPAL_AND_ABOVE`-only)
- `/attendance` school-summary widget 403s (same cause)
- `/attendance/requests` approve/reject buttons render but 403 (review
  endpoint excludes TEACHER) — **ruling (confirmed via WEB-P Phase 2
  investigation):** same pattern as student-edit below, not a gap.
  `PATCH /attendance/leave/:id/review` is `PRINCIPAL, ACADEMIC_COORDINATOR,
  PLATFORM_ADMIN, SCHOOL_OWNER` only — TEACHER is deliberately excluded from
  approving/rejecting leave requests. The admin page
  (`apps/web/app/(school)/attendance/requests/page.tsx`) renders the
  Approve/Reject buttons unconditionally for any staff viewer (no role
  check in the file) and `route-access.ts` has no narrower row for this
  path (it falls under the generic `/attendance` prefix, which is
  TEACHER_TIER) — so a TEACHER reaching this admin page today sees live,
  enabled buttons that 403 on click. The new portal must NOT build any
  approve/reject affordance for TEACHER — a view-only leave-request list is
  correct. **Known issue, not fixed as part of WEB-P:** the old admin page's
  dead buttons for TEACHER are left as-is — this is moot once Phase 6 (§7)
  removes teacher access from admin entirely, and fixing admin bugs is out
  of scope for building the new portal. Recorded here so this isn't
  silently forgotten if the Phase 6 cutover timeline ever slips.
- `/students/[id]/edit` save 403s (PATCH excludes TEACHER) — **ruling:**
  TEACHER should not be able to edit students. This was a UI leak (edit
  affordance reachable but always 403ing), not a feature to fix. The new
  portal must not surface a student-edit screen/affordance for TEACHER at all.
- `/students/[id]` fees tab 403s (finance endpoints exclude TEACHER by
  design — likely correct to keep excluded; needs one explicit ruling, not
  an assumed fix)

## 7. Teacher login cutover plan

- **Hard cutover** once WEB-P teacher module ships: teacher login removed
  from admin entirely.
- Frontend removal is contained: zero inline `TEACHER` conditionals found in
  admin code — all gating funnels through `route-access.ts` and
  `sidebar.tsx:143` (`allowedNavItems`). Removing TEACHER is a two-file edit.
- **Cutover trigger: confirm-parity-based, not calendar-based.** No fixed
  deprecation deadline. Srijan personally verifies the new portal against
  a short checklist (Phase 2 + Phase 3 acceptance criteria + the student-
  edit removal + the timetable ownership fix) before admin teacher-login
  is removed. Only after that manual sign-off does Phase 6 proceed.
- **Scope beyond "own class/subject" to verify carries over correctly:**
  - `bulkMark` (attendance) and `bulkEnterMarks` (exam marks) are
    intentionally soft-scoped — any teacher can write to any section,
    accountability recorded via `marked_by`/`entered_by`. This is an
    established design choice (not a bug) — must be preserved, not
    "fixed" into a hard scope check during the port.
  - `GET /timetable/teacher/:teacherId` has no ownership check (asymmetric
    vs. `getSectionTimetable`, which does check) — **ruling:** teachers
    should only see their own assigned timetable. Since WEB-P is the first
    UI to actually call this route, add an ownership check (teacher can
    only pass their own `teacherId`, or the endpoint derives it from the
    authenticated session rather than accepting an arbitrary param) before
    wiring it into the portal.
  - Full school-wide roster/structure read access (`/students`, `/classes`,
    `/subjects`, `/academic-years`) is not scoped to "own classes" — carries
    over as-is.

## 8. Phase breakdown (proposed — confirm before Phase 1 prompt)

1. **Phase 0.5 — prerequisite:** de-fork `bs-calendar` in `apps/web` (small,
   standalone PR, unblocks later BS date work)
2. **Phase 1 — auth/shell/routing:** `ROUTE_ACCESS` entries for
   STUDENT/PARENT/TEACHER, portal route groups, home-route logic, base
   layout reusing `BrandingScript`/`BrandingSync`, i18n scaffold (English +
   Nepali toggle), Devanagari font loaded
3. **Phase 2 — Teacher core:** attendance-marking grid (desktop-optimized),
   marks-entry grid, assignment view/review + **net-new creation flow**,
   fix the 4 pre-existing 403 bugs
4. **Phase 3 — Teacher HR self-service:** own leave, own profile, own
   timetable, own payroll slips (backend already exists — pure frontend)
5. **Phase 4 — Student:** dashboard, attendance calendar, timetable,
   notices, results+PDF, assignment view/submission
6. **Phase 5 — Parent:** dashboard, attendance, leave request for child,
   notices, results+PDF, timetable, assignment view, child-switcher
   (dropdown + side-by-side), **view-only** fees
7. **Phase 6 — Teacher login cutover:** remove TEACHER from admin
   (`route-access.ts` + `sidebar.tsx`), after parity confirmed and
   deprecation window observed

Each phase closes with live HTTP + PostgreSQL `SELECT` read-back proof,
raw terminal output (`tsc --noEmit` + test count), per the established
workflow. IDOR/cross-tenant probes apply to every new endpoint touched,
especially the PARENT-scoped fee reads (existing guardian-ownership checks
are correct today but re-verify per new screen).

## 9. Open items for Phase 1 kickoff

All rulings resolved. Ready for Phase 1 build prompt.
