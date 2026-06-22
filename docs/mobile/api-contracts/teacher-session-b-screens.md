# Teacher Session B — Mobile screens
# Aaramva Shikshya
# (Renumber the filename to fit your docs/api-contracts/ sequence, e.g. 27-teacher-screens.md)

## Prerequisites
- Teacher Session A complete; suite green (251/251).
- These teacher-scoped endpoints now exist and are confirmed:
  - `GET /api/v1/timetable/my` — weekly slots for the logged-in teacher
  - `GET /api/v1/timetable/my/sections` — DISTINCT sections (class-teacher ∪ timetable)
  - `GET /api/v1/attendance/staff/my/summary`, `GET /api/v1/attendance/staff/my`
  - `GET /api/v1/hr/staff/me`
  - `GET /api/v1/hr/leave/my` (+ existing POST to apply for leave)
  - `POST /api/v1/attendance/students/bulk` (bulkMark — records `marked_by`)
- Mobile app already has: multi-session SecureStore, the `X-Client-Type: mobile`
  pattern, the BS calendar grid + day-selector components built for student/parent,
  NativeWind styling, expo-router, the `(parent)` and `(student)` route groups.

## Goal
Build the teacher mobile experience as a new `(teacher)` route group with a 5-tab
layout. Reuse the student/parent components wherever the UI is the same (BS calendar
grid, day selector, NPR/BS formatters) rather than rebuilding them.

**Marks entry is NOT in this session** — see "Deferred" at the bottom.

---

## Routing
- New route group `app/(teacher)/`.
- `app/_layout.tsx` routes a TEACHER-role login to `/(teacher)`.
- Use a typed route in the union (no `as any`) — mirror how `(parent)` was added.

## Tab layout — `app/(teacher)/_layout.tsx`
5 tabs: Home / Timetable / Attendance / My Attendance / Leave.
Hide any legacy `home.tsx` the same way the parent layout does.

---

## Screens

### 1. Home — `app/(teacher)/index.tsx`
- Greeting + teacher name (from `GET /hr/staff/me`).
- "Today's classes": today's slots from `GET /timetable/my`, filtered to the
  current weekday. "Today" is computed in **Asia/Kathmandu**, and the school week
  is Sunday–Friday (Saturday is the weekend — show a rest-day empty state on Sat).
- Quick action: "Mark attendance" → Attendance tab.

### 2. Timetable — `app/(teacher)/timetable.tsx`
- Full weekly view from `GET /timetable/my` + a day selector.
- Reuse the student/parent timetable component/pattern; the data shape is the same
  kind of slot list. Each slot: period/time, subject, class+section, room if present.

### 3. Mark Attendance — `app/(teacher)/attendance.tsx`  ← the core teacher action
Flow:
1. On open, load `GET /timetable/my/sections` and show the teacher's OWN sections
   as the default picker. This is the soft-scope UX: the common case is one tap.
2. A secondary, deliberate affordance — e.g. a "Mark a different section" link or
   toggle — reveals all sections (load the full section list the school admin sees).
   This is NOT the default and should look like the exception, because the backend
   permits cover-marking but we don't want accidental mis-marking.
3. After a section + date are chosen (date defaults to today, Asia/Kathmandu; BS
   displayed, AD sent):
   - Load that section's students.
   - Load any EXISTING attendance for that section+date and pre-fill the toggles,
     so re-opening shows current state rather than a blank slate.
   - VERIFY the exact endpoints for "students in a section" and "existing
     attendance for section+date" before building — they were built for the web
     attendance module. Report the routes you use. Do not invent them.
4. Per-student status toggle (Present / Absent / Late — match the enum the backend
   uses; confirm it). Bulk actions "mark all present" is a nice convenience.
5. Submit via `POST /api/v1/attendance/students/bulk`. On success, confirm and keep
   the marked state visible. The backend records `marked_by` automatically.

### 4. My Attendance — `app/(teacher)/my-attendance.tsx`
- The teacher's OWN staff attendance: summary card from
  `GET /attendance/staff/my/summary` + a BS calendar grid from
  `GET /attendance/staff/my` (reuse the grid component from student/parent).

### 5. Leave — `app/(teacher)/leave.tsx`
- List the teacher's leave requests from `GET /hr/leave/my`.
- Apply for leave via the existing POST endpoint (confirm its exact path/body from
  the HR module). BS dates shown, AD sent. Status badge per request.

---

## Conventions
- BS displayed everywhere a date is shown; AD sent to the backend. Route all date
  rendering through the existing `adToBs` + `formatBs` utilities — no raw
  `toLocaleDateString` in screens (the notices.tsx lesson).
- "Today" / current weekday computed in Asia/Kathmandu. School week Sun–Fri.
- Any money (none expected here) stays formatted from backend `NUMERIC(10,2)`,
  never recomputed as a float on the client.
- TanStack Query hooks in a `hooks/useTeacher*.ts` file, mirroring `useParentChild`.
  Add `enabled` guards so queries don't fire before the session/token is ready.
- Keep the `{ success, data, meta }` unwrap consistent with the existing api layer.

## Tests / verification
- `tsc --noEmit` clean (no `as any` on the teacher route).
- Manually confirm: a teacher logs in → lands in `(teacher)` → can see today's
  classes, open the weekly timetable, mark a section's attendance (own section in
  one tap), view own attendance, and see/apply leave.

---

## Deferred to Session C — Marks entry
Marks entry needs a backend pre-flight first: a teacher must be able to discover
WHICH exam schedules apply to their sections/subjects before they can enter marks,
and it's unconfirmed whether a teacher-scoped "exam schedules for my section/
subject" path exists (the web Examination module was admin-driven). `bulkEnterMarks`
exists and records `entered_by`, but the discovery layer is unverified. Do not
build the marks-entry screen in Session B. We'll pre-flight that backend separately,
the same way we pre-flighted the teacher linkage.
