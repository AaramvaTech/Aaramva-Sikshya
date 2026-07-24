# Portal Timetable UX + Student Attendance Calendar Fix — Design

> 2026-07-24 — Follow-up to the portal shell/sidebar UI/UX pass (merged to
> `main` earlier today). Two pieces: (1) mirror the parent attendance
> calendar width fix onto the student portal, (2) improve the weekly
> timetable's "at a glance" understanding across all three portals
> (student/parent/teacher).

---

## 1. Problem Statement

**Student attendance calendar.** `apps/web/app/(portal)/student/attendance/page.tsx`
has the exact same bug the parent attendance page had before today's fix:
the BS-month grid renders `aspect-square w-full` day cells inside a card
with no max-width constraint, so cells balloon on wide viewports.

**Timetable.** All three portals (`student/timetable`, `parent/timetable`,
inline; `teacher/timetable` via the shared `components/timetable/
my-timetable-grid.tsx`) render a plain Period × Sun–Fri HTML table. Every
filled cell is visually identical — the same uniform brand-blue card
regardless of subject — so nothing helps a viewer recognize "this is Math"
at a glance. There's no indication of which column is today, or which
period is happening right now. Time is present but tucked into 11px gray
text at the bottom of each card.

Investigated before designing: `TimetableSlot` (student/parent's
`SectionTimetable.schedule`) and `TeacherSlotItem` (teacher's
`TeacherTimetable.schedule`) share every field (`slotId`, `periodNumber`,
`startTime`, `endTime`, `subject: {id, name, code}`, `room`) except one
"who/where" line — student/parent show `teacher.fullName`, teacher shows
`${className} ${section}`. The three tables are otherwise byte-for-byte
identical markup. `MyTimetableGrid` (teacher's grid) has exactly one
importer (`teacher/timetable/page.tsx`), so it can be fully superseded
rather than kept alongside a new component.

## 2. Scope

- Student attendance calendar: same fix pattern as parent (already shipped
  today), scoped to that one page.
- Timetable: touches `student/timetable/page.tsx`, `parent/timetable/
  page.tsx`, `teacher/timetable/page.tsx`, retires `components/timetable/
  my-timetable-grid.tsx`, adds one new shared grid component and one new
  subject-color utility.
- No backend changes. No change to any data-fetching hook, API client, or
  the IDOR-verified scoping already in place for these three screens
  (`getSectionTimetable`'s STUDENT/PARENT ownership checks, `GET /timetable/my`'s
  self-scoping) — this is rendering only. Each page still resolves its own
  `sectionId`/timetable data exactly as it does today; only what happens
  with that data once fetched changes.
- No new features beyond visual/structural improvements (no timetable
  editing from these read-only portals, no new API calls).

## 3. Student attendance calendar fix

Identical treatment to the parent page shipped earlier today: the calendar
+ month-nav move into a `max-w-[560px]` column, and at `xl:` breakpoints
that column sits beside a second column so the freed width is used
purposefully instead of sitting empty. Student's page has no leave-request
form (out of scope for STUDENT per the locked WEB-P spec), so the second
column holds the monthly summary strip instead — the year-to-date stat card
stays full-width and first, exactly as it does on parent's page.

## 4. Shared `TimetableGrid` component

### 4.1 Why one shared component, not three

The three pages' tables are structurally identical (Period-rows ×
Sun–Fri-columns, same card shape, same empty-slot placeholder). The new
behavior below (subject colors, today-column highlight, "now" indicator)
needs to be identical across all three — implementing it three times
invites exactly the kind of drift this project's own review history has
flagged before (the async-gate bug class recurring across Phases 2–4
because a fix landed in one file and not its siblings). One component,
fed a normalized slot shape, removes that risk entirely and deletes two
near-duplicate inline tables plus the now-redundant `MyTimetableGrid`.

### 4.2 Normalized slot shape

`apps/web/components/timetable/timetable-grid.tsx` knows nothing about
`TimetableSlot` or `TeacherSlotItem` — each page maps its own API shape
into this common one before rendering:

```ts
export interface NormalizedTimetableSlot {
  slotId: string;
  periodNumber: number;
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  subjectId: string;
  subjectName: string;
  subtitle: string;  // teacher.fullName (student/parent) or "{className} {section}" (teacher)
  room: string | null;
}

export interface TimetableGridProps {
  schedule: Record<string, NormalizedTimetableSlot[]>; // key = '0'..'5', Sun-Fri
}
```

### 4.3 Subject color-coding

New `apps/web/lib/subjects.ts` — an 8-color categorical palette in the same
`{bg, text}` shape the attendance calendars' `STATUS_CELL_STYLES` already
use (built from Tailwind's own color families: blue/emerald/violet/amber/
pink/cyan/orange/teal, each with a light/dark pair), plus a `border` accent
class for a colored left bar on each card. `subjectColor(subjectId)` picks
a palette entry via a stable string hash of the subject's id — not its
position in a list, since the same subject can appear in different array
positions across different days/periods; hashing the id guarantees "Math"
is always the same color everywhere it appears on the grid. This mirrors
`apps/mobile/lib/subjects.ts`'s `SUBJECT_PALETTE`/`subjectColor()` pattern
(a documented, reviewed "decorative, not brand-coupled" exception on that
platform) — the *idea* is ported, not the code; web never imports from
mobile, and the palette itself is expressed in Tailwind classes to match
every other color table already in this codebase (`STATUS_CELL_STYLES`,
admin's status badges) rather than mobile's raw hex objects.

### 4.4 Today's column + "now" indicator

- The day header (`<th>`) for today's weekday gets bold, brand-colored
  text, computed from `new Date().getDay()` (`0`=Sun…`6`=Sat — already the
  exact key convention `DAYS` uses in all three existing pages).
- Empty-slot placeholder boxes in today's column get a subtle tint. Filled
  (subject-colored) cards do **not** get a competing column tint — subject
  color answers "what," the today-column answers "when," and stacking a
  second background color on top of the first would muddy both signals.
- The one slot currently in progress — today's column *and* the current
  clock time falls inside `[startTime, endTime)` — gets a `ring-2
  ring-brand-500` (the same treatment the attendance calendars already use
  for "today's cell") plus a small "Now" badge. Refreshed every 60 seconds
  via an internal interval (cleared on unmount) so it doesn't go stale on a
  page left open across a period change, without over-engineering
  second-level precision nothing here needs.
- Saturday is (as today) never rendered as a column, so there is never a
  "today" highlight on a Saturday view — correct, since Saturday is a
  non-school day in this dataset already.

### 4.5 Period-time subcaption

The leftmost "P{n}" column currently carries no time information — if a
student's period 3 is empty on a given day, there's no way to tell what
time period 3 even is without finding a filled cell for it elsewhere.
Fix: derive each rendered period's time range from the first slot found
for that period number (across any day) and show it as a small subcaption
under "P{n}" (e.g. "P3" / "10:15–11:00"). Periods only ever appear in the
rendered set when at least one real slot references them, so there is
always a match.

### 4.6 Small legend caption

One line beneath the table, matching the attendance calendars' existing
legend convention: brief text noting the today-column and "now" ring, so
a first-time viewer doesn't have to guess what the highlight means.

## 5. Pages

- `student/timetable/page.tsx`, `parent/timetable/page.tsx`: keep every
  existing hook call, loading/error/empty-state guard branch, and the
  `sectionId`-resolution logic (including parent's `useSelectedChild()`
  dependency) completely unchanged. Only the final "render the real
  timetable" branch changes: build the normalized schedule via a small
  `useMemo`, pass it to `<TimetableGrid />` instead of the inline `<table>`.
- `teacher/timetable/page.tsx`: same treatment — normalize `TeacherTimetable`
  into the common shape, swap `<MyTimetableGrid timetable={...} />` for
  `<TimetableGrid schedule={...} />`.
- Delete `components/timetable/my-timetable-grid.tsx` (zero remaining
  importers after the swap, confirmed by grep before writing this doc).

## 6. Explicitly preserved (must not regress)

- Every existing loading/error/empty-state branch on all three pages
  (including parent's four-way children-loading/error/empty/no-selection
  guard chain, and student's `notEnrolled` handling) — untouched.
- The STUDENT-branch IDOR fix in `getSectionTimetable` and the
  self-scoping on `GET /timetable/my` — no backend files touched, no
  change to which `sectionId`/data source each page queries.
- `sectionId` continues to come exclusively from the resolved
  profile/child enrollment on student/parent, never a route param or
  user input — the normalization step only reshapes the *response* data,
  it does not touch how the request is formed.

## 7. Testing

`TimetableGrid` and `subjects.ts` are new, logic-bearing, shared code —
worth real unit tests (mirrors this project's established bar: new
shared/logic-bearing components get tests, pure page-level Tailwind class
changes don't):

- `subjects.ts`: `subjectColor(id)` is stable for the same id across calls;
  different ids can land on different palette entries.
- `TimetableGrid`: renders periods/day columns from a normalized schedule;
  today's header is highlighted for a mocked weekday; the slot whose time
  range contains a mocked "now" gets the ring/badge; a slot outside that
  range does not; the period subcaption derives the correct time range.

The three page-level changes (normalization + swap to `<TimetableGrid />`)
and the student attendance calendar's layout change are Tailwind
class/JSX-structure changes over already-tested data flows — verified via
`tsc --noEmit` + the full suite, not new page-level component tests,
consistent with how the parent attendance calendar fix was verified
earlier today.

## 8. Non-goals

- No mobile-app changes (mobile already has its own `AttendanceCalendar`/
  `SubjectSlot` components with this exact pattern — out of scope here).
- No timetable editing from any of these three read-only portals.
- No change to which roles can see which timetable, or how `sectionId`/
  teacher-id is resolved.
- No new API endpoints or hook changes.
