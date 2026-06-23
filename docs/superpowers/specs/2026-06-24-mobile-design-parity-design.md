# Mobile App — Design Parity with Claude Design Comp

**Date:** 2026-06-24
**Source comp:** Claude Design project "Aaramva Sikshya Mobile App Design"
(`0968c674-c4e5-4278-b855-49d0b327c56f`), file `Aaramva Shikshya App.dc.html`
**Target:** `apps/mobile/` (Expo SDK 56, expo-router, NativeWind v4)

---

## 1. Purpose

Bring the React Native mobile app to faithful visual parity with the design
comp **without disturbing any existing wired feature**. The app already
implements most of the comp (same per-school theming, Plus Jakarta Sans font,
attendance/results/routine flows wired to real APIs). This work is therefore an
**audit-and-polish pass plus a small number of targeted additions**, not a
redesign or rewrite.

The user's headline requirement: *"maintain all the features and UI/UX."*

## 2. Guiding principle — evolve, don't rewrite

Every existing screen is wired to real endpoints through TanStack Query hooks and
re-themed per school by `ThemeSync`. This work adjusts **presentation only**
(spacing, card radius/shadow, header treatment, stat chips, legends, section
labels, icon choices, token-driven colors). It must never:

- replace or rewire a query hook, route, or Zustand store,
- alter the auth state machine (`booting → noSchool → unauthed → authed`),
- change an API contract or response-extraction path,
- introduce a second brand-color literal (brand color flows only through the
  `--primary` token / `useThemeColors()`), or
- touch the documented decorative palettes (subject hues `lib/subjects.ts`,
  semantic status palette in `lib/attendance.ts`).

## 3. Design-system decisions (approved)

1. **Icons — keep Ionicons.** The comp uses Material Symbols Rounded; the app
   uses Ionicons (`@expo/vector-icons`) everywhere. We keep Ionicons and only
   swap individual icon *choices* to better match the comp's intent. A full
   icon-library swap is out of scope (high risk/effort, not required by brand
   docs).
2. **Font / brand / theming already match.** Plus Jakarta Sans
   (`lib/theme/fonts.ts`), per-school `--primary`, and the semantic status
   palette are unchanged. The maroon "Gyan Jyoti" look in the comp is just the
   demo school's brand color produced by `ThemeSync` — not a new palette.

## 4. Scope

### Workstream A — Screen audit & drift fixes (the bulk of the work)

For each screen: pull its exact comp section from the source HTML, diff against
the live screen, and fix only genuine visual drift. Candidate diff dimensions:
header/hero band treatment, card corner radius and shadow scale, stat-chip
layout, calendar cells, legend, section labels, button styling, spacing rhythm.

Screens in audit set:

- **Auth:** code entry (`app/index.tsx` step 1), school-found confirm
  (`app/index.tsx` step 2), login (`app/login.tsx`)
- **Student:** home (`(student)/index.tsx`), attendance calendar
  (`(student)/attendance.tsx`), routine (`(student)/timetable.tsx`), notices
  (`(student)/notices.tsx`), profile (`(student)/profile.tsx`), results /
  report-card (`(student)/results.tsx`)
- **Parent:** home (`(parent)/index.tsx`, child picker), attendance
  (`(parent)/attendance.tsx`), results (`(parent)/results.tsx`), notices
  (`(parent)/notices.tsx`), fees (`(parent)/fees.tsx`), profile
  (`(parent)/profile.tsx`)
- **Teacher:** home (`(teacher)/index.tsx`), routine (`(teacher)/timetable.tsx`),
  mark-attendance (`(teacher)/attendance.tsx`), marks (`(teacher)/marks.tsx`),
  profile (`(teacher)/profile.tsx`)

Shared UI primitives in `components/ui/` are the preferred place to fix drift so
a change propagates to every consumer (e.g. `ScreenHeader`, `Card`,
`AttendanceSummaryCard`, `AttendanceCalendar`, `Legend`). Prefer editing the
shared primitive over per-screen patches when the drift is shared.

### Workstream B — Targeted new / expanded screens

- **Student annual "Report card" view** — *conditional*. The audit first confirms
  whether `(student)/results.tsx` (already wired to `/students/me/report-card`,
  which returns `examResults[]` + `annualResult`) already renders the annual view
  from the comp. If it does, fold the comp's report-card styling into that
  screen. Build a separate route only if results.tsx genuinely lacks the annual
  layout.
- **Read-only "Profile details" views** (student / parent / teacher) — expanded
  read-only display of the fields each `GET …/me` endpoint already returns
  (`/students/me`, `/hr/staff/me`, `/students/my-children`). Matches the comp's
  edit-profile layout but with **no save action** (no update endpoint exists;
  read-only by decision). Reachable from each profile screen.

## 5. Backend reality (no API changes in this work)

| Comp screen | Backend status | Decision |
|---|---|---|
| Student results / report card | `GET /students/me/report-card` (live) | Wire / already wired |
| Parent child results | `GET /exams/results/report-card/:studentId` (live) | Already wired |
| Profile (all roles) | GET-only, no PATCH | Read-only detail view |
| Homework | No E-Learning backend | **Out of scope** |
| Settings prefs | No backend | **Out of scope** |

No NestJS/API changes are part of this work.

## 6. Out of scope (approved)

- ❌ Homework / e-learning screen (no backend)
- ❌ Dedicated Settings screens (sign-out stays on profile screens)
- ❌ Edit/save on any profile (read-only — no update endpoint)
- ❌ Auth "you're signed in" success splash (app routes straight to dashboard;
  no functional value)
- ❌ Material Symbols icon-library migration
- ❌ Any API / backend change

## 7. Verification

- `cd apps/mobile && npx tsc --noEmit` exits 0 after each screen's changes.
- Per-screen visual self-check against the corresponding comp section.
- No diffs in: hook files, route registration, auth state machine, API contracts.
- Spot-check that per-school theming still drives all brand color (no new hex
  literals introduced).

## 8. Risks

- **Shared-primitive drift fixes** can ripple to screens not in the immediate
  focus. Mitigation: after editing a shared component, re-check every consumer
  listed in `components/ui/index.ts` usages.
- **results.tsx report-card overlap** — must inspect before deciding to build a
  new route, to avoid a duplicate/competing screen.
- **expo-router tab/route count** — adding a "Profile details" route must not
  create a phantom tab (precedent: Session 22 `home.tsx` cleanup). New detail
  views should be non-tab stack routes within the role group.
