# Teacher Session D — Mobile: marks entry (final teacher screen)
# Aaramva Shikshya
# (Renumber the filename to fit your docs/api-contracts/ sequence, e.g. 29-teacher-marks-entry.md)

## Prerequisites
- Teacher Sessions A, B, C complete; suite green (257).
- Confirmed endpoints this screen uses:
  - `GET /api/v1/exams/schedules/my` — teacher's own exam schedules. Each row:
    `examScheduleId, examTypeId, examTypeName, subjectId, subjectName, classId,
    className, examDate, startTime, fullMarks, passMarks, theoryMarks, practicalMarks`.
  - `GET /api/v1/timetable/my/sections` — `{ sectionId, sectionName, classId, className }`.
  - `GET /api/v1/students?sectionId=<uuid>&limit=200` — students in a section.
  - `GET /api/v1/exams/marks?examScheduleId=<uuid>` — existing marks for prefill:
    `{ studentId, marksObtained, theoryMarks, practicalMarks, isAbsent, remarks }`.
  - `POST /api/v1/exams/marks/bulk` — submit. Records `entered_by` server-side.
- Mobile app already has the `(teacher)` route group, BS components, the
  load-separately-merge pattern used elsewhere, NativeWind, expo-router.

## Goal
Build the marks-entry screen — the last piece of the teacher app. A teacher picks
one of their exam schedules, picks a section, sees that section's students with any
existing marks prefilled, enters/edits marks (respecting the schedule's marks
structure), and submits.

---

## Navigation
Add a **Marks** entry point in the `(teacher)` group. Preferred: a 6th tab "Marks"
in `app/(teacher)/_layout.tsx`. If six tabs crowd the bar, instead surface it as a
quick-action card on Home that pushes to `app/(teacher)/marks.tsx` — dev's call,
but it must be reachable in one obvious step. No `as any` on the route.

---

## Flow — `app/(teacher)/marks.tsx`

### Step 1 — pick a schedule
- Load `GET /exams/schedules/my`. List by exam type + subject + class, e.g.
  "First Term — Mathematics — Class 10", with the exam date shown in **BS**.
- Optional: a filter chip by exam type (passes `examTypeId`).
- (Soft-scope consistency, optional/secondary) a "different class" affordance can
  reveal the broader `GET /exams/schedules?classId=` list for cover situations.
  Keep it the exception, not the default — same principle as the attendance screen.

### Step 2 — pick a section
- The schedule is class-level (`classId`). Load `GET /timetable/my/sections` and
  show the teacher's OWN sections **filtered to the schedule's `classId`**.
- If the teacher has exactly one own section in that class, auto-select it.

### Step 3 — load roster + prefill (load-separately-merge)
- Load that section's students: `GET /students?sectionId=<id>&limit=200`.
- Load existing marks for the schedule: `GET /exams/marks?examScheduleId=<id>`.
- Merge at display time: key existing marks by `studentId`, attach to each student.
  Students with no prior marks show empty inputs; those with marks show prefilled
  values (or the Absent toggle on if `isAbsent`).

### Step 4 — enter marks (UI adapts to the schedule's structure)
Inspect the schedule's `theoryMarks` / `practicalMarks`:
- **Split exam** (both `theoryMarks` and `practicalMarks` are set and > 0):
  show two inputs per student — Theory `/{theoryMarks}` and Practical
  `/{practicalMarks}`. Compute `marksObtained = theory + practical` for display
  and submission.
- **Single exam** (no meaningful theory/practical split): one input per student,
  `marksObtained` shown as `/{fullMarks}`.
- **Absent toggle** per student: when on, clear/disable the marks input(s) for that
  student and submit `isAbsent: true` with no `marksObtained`.
- Optional per-student `remarks` field.

### Step 5 — submit
- `POST /exams/marks/bulk` with `{ examScheduleId, marks: [...] }`.
- Include ONLY students the teacher actually touched (a value entered, or Absent
  toggled). Do NOT send untouched students — the endpoint UPSERTs, and sending
  empty/null would risk clobbering existing data.
- On success: confirm, keep the entered state visible (don't blank the screen).

---

## Client-side validation (mirror the server, fail fast before POST)
The server validates too, but catch these in the UI so the teacher gets immediate
feedback instead of a rejected request:
- `marksObtained` must be `>= 0` and `<= fullMarks`. Block over-limit input.
- Split exam: `theory <= theoryMarks` and `practical <= practicalMarks`.
- If `isAbsent` is on, no marks may be entered for that student.
- (Server also enforces `theory + practical == marksObtained`; since the UI
  computes `marksObtained` from the two, this holds automatically.)

---

## Conventions
- Exam dates shown in **BS**, via the existing `adToBs` + `formatBs` utilities —
  no raw date formatting in the screen.
- Marks are numbers from the backend; render them as-is, don't do lossy float math.
- `{ success, data, meta }` unwrap consistent with the api layer.
- TanStack Query hooks in `hooks/useTeacherMarks.ts` (or extend the teacher hooks
  file), with `enabled` guards so nothing fires before a schedule/section is chosen.

## Verification
- `tsc --noEmit` clean; the Marks route is typed (no `as any`).
- Walk the flow end to end: pick schedule → section auto/selected → students load
  with any existing marks prefilled → enter a split exam and a single exam → toggle
  one student absent → submit → reopen and confirm the values persisted.
- Confirm over-limit entry is blocked and the absent toggle clears inputs.

## After this
The teacher app is feature-complete: Home, Timetable, Mark Attendance, Marks Entry,
My Attendance, Leave. Next is a full end-to-end test pass with proper seed data
(a teacher with timetable slots, enrolled sections, and an exam schedule).
