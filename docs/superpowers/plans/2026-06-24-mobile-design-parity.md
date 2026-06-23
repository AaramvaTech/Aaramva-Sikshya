# Mobile App Design Parity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `apps/mobile/` to faithful visual parity with the Claude Design comp while preserving every wired feature.

**Architecture:** Evolve existing token-driven screens and shared `components/ui/` primitives — adjust presentation only, never the data layer. Each screen is audited against its exact comp section, drift is fixed (preferring shared-primitive edits when drift is shared), and verified with `tsc` + a visual self-check.

**Tech Stack:** Expo SDK 56, expo-router, React Native, NativeWind v4, TanStack Query, Ionicons, Plus Jakarta Sans.

## Global Constraints

- **Reference comp (verbatim source):** `docs/superpowers/specs/comp-reference.html`. Each task lists the exact line range for its screen. Read those lines with `Read`/`Grep` before editing.
- **Spec:** `docs/superpowers/specs/2026-06-24-mobile-design-parity-design.md`.
- **Evolve, don't rewrite.** Never replace/rewire a query hook, route, Zustand store, or the auth state machine (`booting → noSchool → unauthed → authed`). No API/backend changes.
- **Brand color only via tokens.** Use `useThemeColors()` / NativeWind tokens (`bg-primary`, `text-foreground`, `bg-surface`, …). Never introduce a brand-color hex literal. The comp's maroon `#98293B` is the demo school's `--primary`; do NOT hardcode it.
- **Do not touch decorative palettes:** subject hues `lib/subjects.ts`, semantic status palette `lib/attendance.ts` (PRESENT green / ABSENT red / LATE amber / LEAVE blue). The comp's per-status chip colors must map to these existing constants, not new literals.
- **Icons:** keep Ionicons; only change individual icon name choices to better match the comp. No Material Symbols migration.
- **Fonts:** use the `FONT` family tokens from `lib/theme/fonts.ts` (already Plus Jakarta Sans). Never use bare `fontWeight` on custom-font text.
- **Shared-primitive ripple rule:** when drift lives in a `components/ui/` primitive, fix it there, then re-check every consumer (grep the symbol) and visually re-verify them.
- **No phantom tabs:** new non-tab screens (e.g. profile-details) must be plain stack routes inside the role group, registered in that group's `_layout.tsx` `Stack`, not added as `Tabs.Screen`. (Precedent: Session 22 `home.tsx` cleanup.)
- **Verification gate (every task):** `cd apps/mobile && npx tsc --noEmit` exits 0.
- **Commits:** the working tree already has unrelated in-progress changes. Each task commits ONLY the files it touched (explicit `git add <paths>`, never `git add -A`/`.`).

### Per-screen audit procedure (used by every Workstream-A task)

Each audit task follows this loop; steps below are written per-task but the method is constant:

1. `Read` the comp section (exact lines given in the task).
2. `Read` the live screen file (and any shared primitive it renders).
3. Produce a concrete **drift list**: each item = one visual property that differs (e.g. "card radius 16→20", "header pill missing", "stat chip uses literal `#0E9F77` instead of status-token"). If a property already matches, do not touch it.
4. Apply the fixes (shared primitive if shared; otherwise in-screen styles).
5. `npx tsc --noEmit` → expect exit 0.
6. Visual self-check: re-read the changed code and confirm each drift-list item is now resolved and matches the comp section.
7. Commit only the touched files.

A task with an **empty drift list** is valid: record "no drift — screen already matches comp lines X–Y" in the commit body and move on (commit allowed to be a no-op skip).

---

## Workstream A — Screen audit & drift fixes

> Comp line anchors are into `docs/superpowers/specs/comp-reference.html`.

### Task 1: Auth — code entry & school-found confirm

**Files:**
- Modify: `apps/mobile/app/index.tsx`
- Reference: comp lines **81–135** (`authIsCode` 81–108, `authIsFound` 110–135)

**Interfaces:**
- Consumes: existing `GET /tenants/verify/:slug` flow, `useAuthStore`, SecureStore slug persistence — do not change behavior.
- Produces: nothing for later tasks (leaf screen).

- [ ] **Step 1: Read comp + live.** `Read` comp-reference.html lines 81–135. `Read` `apps/mobile/app/index.tsx`. Note the comp's: green `#E9F4EE` header band with wordmark logo, "Find your school" title + helper copy, input pill (school icon, 50px height, radius 14, border `#DCE6DF`), gradient "Find school" button (`linear-gradient(135deg,#0B6B43,#064E33)` = primary→darker primary), "Don't know your code?" help row, and the bottom security note card. For `authIsFound`: school card (logo tile, name, location, slug tag, check_circle), "Continue to login" gradient button, "Not your school?" reset.
- [ ] **Step 2: Build drift list.** Write the concrete list of properties in `index.tsx` that differ from the comp (band color/padding, title sizes, input pill styling, button gradient, helper rows, security note, found-card layout). Confirm the onboarding `OB` literal palette exception (CLAUDE.md) still applies — the green here IS allowed as an exact-design onboarding literal, so keep `#0B6B43`/`#064E33`/`#E9F4EE` literals here only.
- [ ] **Step 3: Apply fixes** per the drift list, preserving all handlers (`handleSearch`, `handleConfirm`, reset) and the two-step state.
- [ ] **Step 4: Verify types.** Run `cd apps/mobile && npx tsc --noEmit` → expect exit 0.
- [ ] **Step 5: Visual self-check** each drift-list item against comp 81–135.
- [ ] **Step 6: Commit.** `git add apps/mobile/app/index.tsx && git commit -m "style(mobile): auth code-entry & school-found parity with comp"`

### Task 2: Auth — login

**Files:**
- Modify: `apps/mobile/app/login.tsx`
- Reference: comp lines **137–163** (`authIsLogin`)

**Interfaces:**
- Consumes: existing `POST /auth/login` flow, session persistence — unchanged.

- [ ] **Step 1: Read** comp 137–163 and `apps/mobile/app/login.tsx`. Comp uses the **school brand** header band (`#F8ECEE` tint = brand-surface, brand logo tile, school name, "Sign in to your account"), "Welcome back" title, uppercase field labels, email + password pills (radius 14, `#F7F4F4` bg), brand-gradient "Sign In" button, "Switch school" link. Header band + button must be **token-driven** (brand-surface / primary gradient), NOT the onboarding green and NOT a literal maroon.
- [ ] **Step 2: Drift list** for `login.tsx`.
- [ ] **Step 3: Apply fixes** — brand band via `c.brandSurface`/`c.primary`; keep `handleLogin`, error display, "Switch school" reset.
- [ ] **Step 4:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 5:** Visual self-check vs comp 137–163.
- [ ] **Step 6: Commit** only `apps/mobile/app/login.tsx`.

### Task 3: Student — home

**Files:**
- Modify: `apps/mobile/app/(student)/index.tsx` and/or shared `components/ui/AttendanceSummaryCard.tsx`, `TodayClasses.tsx`
- Reference: comp lines **206–276** (`sHome`)

- [ ] **Step 1: Read** comp 206–276 and `(student)/index.tsx`. Compare: brand-surface hero band (school chip + notification bell w/ badge + avatar), "Today · {BS}", greeting, name, enrollment line; attendance card (big % + working-days pill + 2×2 stat chips + progress bar); "Quick access" 3-col feature grid (comp shows 6 tiles w/ tinted icon squares — live shows 4 in a row); "Today's classes" card with "Routine" link.
- [ ] **Step 2: Drift list.** Note especially: comp quick-access is a **3-column grid of 6** tinted tiles vs live 4-in-a-row; decide whether to match the 6-tile grid (only include tiles whose destinations exist: Attendance, Routine, Results, Notices, Profile — Homework tile is out of scope, so keep the existing destination set rather than inventing routes). Stat-chip colors must map to status tokens, not literals.
- [ ] **Step 3: Apply fixes.** If the attendance card / chips drift is shared, fix in `AttendanceSummaryCard.tsx` and re-check the parent home consumer (Task 8).
- [ ] **Step 4:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 5:** Visual self-check vs comp 206–276.
- [ ] **Step 6: Commit** touched files.

### Task 4: Student — attendance (calendar)

**Files:**
- Modify: `apps/mobile/app/(student)/attendance.tsx`, shared `components/ui/AttendanceCalendar.tsx`, `Legend.tsx`, `MonthNav.tsx` as needed
- Reference: comp lines **277–329** (`sAttendance`)

- [ ] **Step 1: Read** comp 277–329 and `(student)/attendance.tsx` + the calendar/legend primitives. Compare: brand band w/ 3 stat tiles (Present/Absent/Late), white card with month nav (chevrons + month label), 7-col DOW header, calendar cells (radius 10, status bg, today ring), wrap legend, and "Recent activity" list.
- [ ] **Step 2: Drift list** (cell radius, ring treatment, legend layout, recent-activity rows, Saturday column highlight). Map status colors to `lib/attendance.ts` `STATUS_CONFIG`.
- [ ] **Step 3: Apply fixes** (shared `AttendanceCalendar` preferred for cell/grid drift; re-check parent attendance + teacher consumers).
- [ ] **Step 4:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 5:** Visual self-check vs comp 277–329.
- [ ] **Step 6: Commit** touched files.

### Task 5: Student — routine (timetable)

**Files:**
- Modify: `apps/mobile/app/(student)/timetable.tsx`, shared `components/ui/SubjectSlot.tsx` as needed
- Reference: comp lines **331–384** (`sRoutine`)

- [ ] **Step 1: Read** comp 331–384 and `(student)/timetable.tsx` + `SubjectSlot.tsx`. Compare: brand band w/ title + calendar icon chip, **day-of-week filter pills** (6 days, selected/today states), timeline rows (start/end time gutter, lunch-break dashed divider, period card w/ tinted icon, subject name, "NOW" badge, teacher/room meta, period pill).
- [ ] **Step 2: Drift list** (DOW filter pills, lunch-break row, NOW badge, time gutter, slot card accent).
- [ ] **Step 3: Apply fixes** (subject color accents via `lib/subjects.ts subjectColor(i)` — do not hardcode).
- [ ] **Step 4:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 5:** Visual self-check vs comp 331–384.
- [ ] **Step 6: Commit** touched files.

### Task 6: Student — notices

**Files:**
- Modify: `apps/mobile/app/(student)/notices.tsx`, shared `components/ui/NoticeFeed.tsx` as needed
- Reference: comp lines **386–404** (`sNotices`)

- [ ] **Step 1: Read** comp 386–404 and the notices screen + `NoticeFeed.tsx`. Compare: white header (title + subtitle), notice cards with left accent border, tag chip (uppercase, tinted), date, title, body.
- [ ] **Step 2: Drift list** (card accent border, tag chip styling, spacing).
- [ ] **Step 3: Apply fixes** (fix in `NoticeFeed.tsx` — also consumed by parent notices Task 11; re-check it).
- [ ] **Step 4:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 5:** Visual self-check vs comp 386–404.
- [ ] **Step 6: Commit** touched files.

### Task 7: Student — profile + results/report-card

**Files:**
- Modify: `apps/mobile/app/(student)/profile.tsx`, `apps/mobile/app/(student)/results.tsx`
- Reference: comp lines **406–432** (`sProfile`), **433–456** (`sResults`), **476–504** (`sReport`)

**Interfaces:**
- Consumes: `useMyResults()` (`hooks/useStudentMe.ts`) returning `{ student, examResults[], annualResult }`.

- [ ] **Step 1: Read** comp 406–432 (profile: brand band, settings gear, school chip, avatar, name, adm/class, info rows, settings rows, sign-out), 433–456 (results: back header, maroon GPA/grade/rank gradient card, per-subject rows w/ grade chips), 476–504 (report card: annual GPA summary). `Read` `(student)/profile.tsx` and `(student)/results.tsx`.
- [ ] **Step 2: Decide report-card overlap** (spec §4/§8): confirm whether `results.tsx` already renders the annual `annualResult` view (comp `sReport`). Record the finding. If covered → fold `sReport` styling into results.tsx; if genuinely absent → note it for Task 13 (do NOT build a duplicate route here).
- [ ] **Step 3: Drift list** for profile + results (GPA gradient card via `c.primary` gradient not literal; grade chips map to a grade-color helper or status tokens; info rows; sign-out button styling).
- [ ] **Step 4: Apply fixes** to both screens, keeping all hooks and the sign-out `logout()` call.
- [ ] **Step 5:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 6:** Visual self-check vs comp 406–432, 433–456, 476–504.
- [ ] **Step 7: Commit** both files.

### Task 8: Parent — home (child picker)

**Files:**
- Modify: `apps/mobile/app/(parent)/index.tsx`, shared `components/ui/ChildPicker.tsx`, `AttendanceSummaryCard.tsx`
- Reference: comp lines **604–665** (`pHome`, incl. `multiChild`)

- [ ] **Step 1: Read** comp 604–665 and `(parent)/index.tsx` + `ChildPicker.tsx`. Compare: brand band, multi-child picker chips, selected child summary, attendance summary card, quick links.
- [ ] **Step 2: Drift list** (child picker chip styling, selected state, summary card reuse).
- [ ] **Step 3: Apply fixes** (reuse the same `AttendanceSummaryCard` as student — verify consistency with Task 3).
- [ ] **Step 4:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 5:** Visual self-check vs comp 604–665.
- [ ] **Step 6: Commit** touched files.

### Task 9: Parent — attendance

**Files:**
- Modify: `apps/mobile/app/(parent)/attendance.tsx`
- Reference: comp lines **667–703** (`pAttendance`)

- [ ] **Step 1: Read** comp 667–703 and the parent attendance screen (reuses `AttendanceCalendar` from Task 4).
- [ ] **Step 2: Drift list** (child context header + calendar reuse — most drift should already be resolved by Task 4's shared fix).
- [ ] **Step 3: Apply fixes** (in-screen only; shared calendar already aligned).
- [ ] **Step 4:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 5:** Visual self-check vs comp 667–703.
- [ ] **Step 6: Commit** touched file.

### Task 10: Parent — results

**Files:**
- Modify: `apps/mobile/app/(parent)/results.tsx`
- Reference: comp lines **705–728** (`pResults`)

- [ ] **Step 1: Read** comp 705–728 and `(parent)/results.tsx` (wired to `GET /exams/results/report-card/:childId`). Compare GPA card + subject rows (same visual language as student results Task 7).
- [ ] **Step 2: Drift list.**
- [ ] **Step 3: Apply fixes** (match student results styling for consistency; keep child-scoped hook).
- [ ] **Step 4:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 5:** Visual self-check vs comp 705–728.
- [ ] **Step 6: Commit** touched file.

### Task 11: Parent — notices

**Files:**
- Modify: `apps/mobile/app/(parent)/notices.tsx`
- Reference: comp lines **730–742** (`pNotices`)

- [ ] **Step 1: Read** comp 730–742 and parent notices (reuses `NoticeFeed` from Task 6).
- [ ] **Step 2: Drift list** (should be mostly resolved by Task 6; check header copy).
- [ ] **Step 3: Apply fixes** (in-screen header only).
- [ ] **Step 4:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 5:** Visual self-check vs comp 730–742.
- [ ] **Step 6: Commit** touched file.

### Task 12: Parent — fees + profile

**Files:**
- Modify: `apps/mobile/app/(parent)/fees.tsx`, `apps/mobile/app/(parent)/profile.tsx`
- Reference: comp lines **770–816** (`pFees`), **744–768** (`pProfile`)

- [ ] **Step 1: Read** comp 770–816 (fees: invoice cards, amounts, due/paid status chips, pay CTA) and 744–768 (parent profile: relation, email, children list, sign-out). `Read` both live files.
- [ ] **Step 2: Drift list** for fees + profile (status chips map to status tokens; amount typography; pay button via `c.primary`).
- [ ] **Step 3: Apply fixes**, keeping all fee hooks and the parent profile data.
- [ ] **Step 4:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 5:** Visual self-check vs comp 770–816 and 744–768.
- [ ] **Step 6: Commit** both files.

### Task 13: Teacher — home + routine

**Files:**
- Modify: `apps/mobile/app/(teacher)/index.tsx`, `apps/mobile/app/(teacher)/timetable.tsx`
- Reference: comp lines **909–947** (`tHome`), **949–1010** (`tRoutine`)

- [ ] **Step 1: Read** comp 909–947 (teacher home: brand band, my-sections summary, today's periods, quick actions) and 949–1010 (teacher routine timeline, reuses `SubjectSlot` from Task 5). `Read` both live files.
- [ ] **Step 2: Drift list** for both (home cards, routine timeline — routine drift mostly resolved by Task 5's shared `SubjectSlot`).
- [ ] **Step 3: Apply fixes.**
- [ ] **Step 4:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 5:** Visual self-check vs comp 909–947, 949–1010.
- [ ] **Step 6: Commit** both files.

### Task 14: Teacher — mark attendance + marks

**Files:**
- Modify: `apps/mobile/app/(teacher)/attendance.tsx`, `apps/mobile/app/(teacher)/marks.tsx`, shared `components/ui/Selectable.tsx`
- Reference: comp lines **1012–1039** (`tMark`), **1041–1057** (`tMarks`)

- [ ] **Step 1: Read** comp 1012–1039 (mark attendance: section picker, student rows w/ status toggles) and 1041–1057 (marks: subject/section pickers, mark entry rows). `Read` both live files + `Selectable.tsx`.
- [ ] **Step 2: Drift list** (picker chips via `SelectChip`/`SelectableRow`, status toggle colors via status tokens, row layout).
- [ ] **Step 3: Apply fixes**, keeping bulk-mark / bulk-enter-marks mutation hooks intact.
- [ ] **Step 4:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 5:** Visual self-check vs comp 1012–1039, 1041–1057.
- [ ] **Step 6: Commit** both files.

### Task 15: Teacher — profile

**Files:**
- Modify: `apps/mobile/app/(teacher)/profile.tsx`
- Reference: comp lines **1059–1080** (`tProfile`)

- [ ] **Step 1: Read** comp 1059–1080 (teacher profile: brand band, avatar, name/designation, info rows, sign-out) and `(teacher)/profile.tsx` (wired to `GET /hr/staff/me`).
- [ ] **Step 2: Drift list.**
- [ ] **Step 3: Apply fixes**, keeping the staff `me` hook + sign-out.
- [ ] **Step 4:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 5:** Visual self-check vs comp 1059–1080.
- [ ] **Step 6: Commit** touched file.

---

## Workstream B — Targeted new / expanded screens

### Task 16: Read-only "Profile details" — student

**Files:**
- Create: `apps/mobile/app/(student)/profile-details.tsx`
- Modify: `apps/mobile/app/(student)/_layout.tsx` (register stack route), `apps/mobile/app/(student)/profile.tsx` (link to it)
- Reference: comp lines **505–533** (`sEditProfile`, rendered read-only)

**Interfaces:**
- Consumes: `useMyProfile()` (`hooks/useStudentMe.ts`) → `StudentProfile` (firstName, lastName, photoUrl, admissionNumber, currentEnrollment). Display only the fields the endpoint actually returns; omit comp fields with no data source.

- [ ] **Step 1: Read** comp 505–533 and `StudentProfile` type in `apps/mobile/types/index.ts`. Identify which comp fields map to real data; list comp form fields that have no backing data (these become omitted, not fabricated).
- [ ] **Step 2: Create `profile-details.tsx`** — a back-header + read-only info cards (label/value rows) for the available fields, token-driven, reusing `ScreenHeader`/`Card`. No input fields, no save button (read-only). Use `EmptyState`/`LoadingBlock`/`ErrorState` for query states.
- [ ] **Step 3: Register route** in `(student)/_layout.tsx` as a `Stack.Screen` (NOT a tab) with header hidden, so no phantom tab appears.
- [ ] **Step 4: Link** from `(student)/profile.tsx` (e.g. the existing "Personal details" / settings row) via `router.push('/(student)/profile-details')`.
- [ ] **Step 5:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 6: Manual route check note:** confirm the tab bar still shows the same number of tabs (route is stack, not tab).
- [ ] **Step 7: Commit** the three files.

### Task 17: Read-only "Profile details" — teacher

**Files:**
- Create: `apps/mobile/app/(teacher)/profile-details.tsx`
- Modify: `apps/mobile/app/(teacher)/_layout.tsx`, `apps/mobile/app/(teacher)/profile.tsx`
- Reference: comp lines **1082–1109** (`tEditProfile`, read-only)

**Interfaces:**
- Consumes: the existing teacher `GET /hr/staff/me` hook (find its name in `(teacher)/profile.tsx`). Display returned fields only (name, designation, department, employee id, contact, emergency contact if present).

- [ ] **Step 1: Read** comp 1082–1109 and `(teacher)/profile.tsx` to find the staff-me hook + available fields.
- [ ] **Step 2: Create `profile-details.tsx`** read-only detail view (same pattern as Task 16).
- [ ] **Step 3: Register** stack route in `(teacher)/_layout.tsx` (not a tab).
- [ ] **Step 4: Link** from `(teacher)/profile.tsx`.
- [ ] **Step 5:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 6:** Tab-count check note.
- [ ] **Step 7: Commit** the three files.

### Task 18: Read-only "Profile details" — parent

**Files:**
- Create: `apps/mobile/app/(parent)/profile-details.tsx`
- Modify: `apps/mobile/app/(parent)/_layout.tsx`, `apps/mobile/app/(parent)/profile.tsx`
- Reference: comp lines **818–845** (`pEditProfile`, read-only)

**Interfaces:**
- Consumes: parent profile data already shown in `(parent)/profile.tsx` (relation, email, linked children from `GET /students/my-children`). No new endpoint.

- [ ] **Step 1: Read** comp 818–845 and `(parent)/profile.tsx` for available parent fields + children list.
- [ ] **Step 2: Create `profile-details.tsx`** read-only detail view (guardian contact info + children summary rows). Same pattern as Task 16.
- [ ] **Step 3: Register** stack route in `(parent)/_layout.tsx` (not a tab).
- [ ] **Step 4: Link** from `(parent)/profile.tsx`.
- [ ] **Step 5:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 6:** Tab-count check note.
- [ ] **Step 7: Commit** the three files.

### Task 19: Final pass — full typecheck + consistency sweep

**Files:** none created; verification only.

- [ ] **Step 1:** `cd apps/mobile && npx tsc --noEmit` → expect exit 0 across the whole app.
- [ ] **Step 2: Grep for stray literals** introduced by this work: search changed files for the comp's brand maroon `#98293B` / `#76202F` and the green `#0B6B43`/`#064E33` OUTSIDE `app/index.tsx`, `login.tsx` (onboarding/auth exception) and `lib/theme/tokens.ts`. Any hit elsewhere = a hardcoded brand literal to replace with a token. Expect: no hits.
- [ ] **Step 3: Grep status-color literals** in changed screens that should use `lib/attendance.ts` `STATUS_CONFIG`; confirm none were re-hardcoded.
- [ ] **Step 4: Confirm no data-layer drift:** `git diff --stat` against the start ref shows changes only under `apps/mobile/app/**`, `apps/mobile/components/ui/**`, and `docs/**` — NOT under `apps/mobile/hooks/**`, `apps/mobile/lib/api*`, or `apps/mobile/store/**` (unless a hook was intentionally touched and noted).
- [ ] **Step 5: Commit** any final fixes; otherwise record the clean sweep.

---

## Self-review (completed by plan author)

- **Spec coverage:** Workstream A Tasks 1–15 cover every audit screen in spec §4. Workstream B Tasks 16–18 cover the read-only profile-details additions; report-card overlap is resolved inside Task 7 (spec §4/§8). Out-of-scope items (homework, settings, edit-save, auth success splash, icon migration, API changes) appear in no task — correct.
- **Placeholder scan:** no "TBD/TODO/handle edge cases"; audit tasks intentionally produce a drift list rather than pre-guessing exact style values that can only be known by reading both files — the *method* is fully specified.
- **Type consistency:** hook names referenced (`useMyProfile`, `useMyResults`) match `hooks/useStudentMe.ts`; new routes are stack (not tab) per the no-phantom-tab constraint; commit steps add only touched paths.
- **Note on TDD:** there is no RN unit-test harness in this app (tests live in `apps/api`); the per-task verification cycle is `tsc --noEmit` + visual self-check against named comp lines, which is the appropriate gate for presentation-only changes.
