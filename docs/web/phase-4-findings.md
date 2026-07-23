WEB-P Phase 4 — Student module findings

This note captures the security finding and the incidental discoveries from
this phase, written to a file per the standing instruction to put verbatim
findings here instead of relying on chat relay.

1. Timetable IDOR — STUDENT could read any other section's schedule (fixed)

`GET /timetable/section/:sectionId` (`apps/api/src/modules/academic/
timetable.controller.ts:54-65`) lists `Role.STUDENT` in its `@Roles()`
allowlist. `TimetableService.getSectionTimetable` had an ownership check for
`Role.PARENT` (JOIN through `guardians`), but no equivalent branch for
`Role.STUDENT` — a student passing any other section's UUID got that
section's full weekly timetable (subject names, teacher names, room, times)
with no error and no scoping.

This was not the same gap as the already-known, still-open
`GET /timetable/teacher/:teacherId` issue (WEB-P-PORTAL.md §7) — that route
has zero ownership check for anyone and is TEACHER_AND_ABOVE-only, not
STUDENT-reachable. This is also not the "staff have broad school-structure
read access by design" pattern documented for TEACHER — STUDENT is a
different trust tier and the missing branch was a genuine oversight, not an
intentional broadening. Confirmed by the existing unit test file itself:
`getSectionTimetable skips IDOR check for non-PARENT roles` used `Role.TEACHER`
as its example, never asserted anything about STUDENT.

Fix: added a STUDENT branch mirroring the PARENT one (direct
`students.user_id` match, no `guardians` JOIN needed), throwing the same
`FORBIDDEN_SCOPE` on a mismatch. TEACHER/staff behavior is untouched — the
fix is purely additive, inserted between the existing PARENT block and the
unconditional slots query.

Live proof (real HTTP against the running dev API, demo tenant):
- Before code review sign-off, unit tests written for both cases (own
  section proceeds, foreign section 403s) — `apps/api/src/modules/academic/
  __tests__/timetable.service.spec.ts`.
- After merge, live-proved against the real running API as the demo student
  (`student@demo.school`, password shimmed/verified/restored, 401-proven
  after restoration): `GET /timetable/section/<own-section>` → 200 with real
  periods; `GET /timetable/section/<a-different-real-section-in-the-same-
  tenant>` → `403 FORBIDDEN_SCOPE`.

2. Two lower-severity, out-of-scope gaps found during research — NOT fixed here

- `GET /communication/notices/:id` (`apps/api/src/modules/communication/
  communication.controller.ts`) does no audience/publish filtering at all —
  any authenticated role, including STUDENT, can fetch any single notice by
  UUID regardless of audience or published state. Not exercised by any
  Phase 4 screen: the student notices list already returns full `body` text
  per row, so the new notices screen never calls the `:id` route (mirrors
  how the assignment detail screen avoids the staff-only single-assignment
  GET by deriving from the list cache instead). Explicitly out of the IDOR-
  probe scope named in the phase brief (attendance/results/assignments/
  timetable — not notices). Flagged for a future pass.
- Attendance and results are structurally IDOR-proof by construction — every
  `/students/me/*` endpoint resolves the student exclusively from
  `token.userId → students.user_id`, never from a param, so there was
  nothing to probe there beyond confirming the absence of a param (confirmed
  by direct reading of `student.controller.ts`/`student-me.service.ts`
  during research).

3. Pre-existing timezone bug found in `BsDateInput` — NOT fixed, NOT propagated

`apps/web/components/shared/bs-date-input.tsx`'s `fireChange()` converts a
`bsToAd(...)` result to an AD date string via
`ad.toISOString().split('T')[0]`. `toISOString()` converts a locally-
constructed `Date` to UTC before formatting, which shifts the date backward
by one day for any user in a UTC+ timezone. Confirmed live on the dev
machine (`Asia/Kathmandu`, UTC+5:45):
`new Date(2026,6,17,0,0,0).toISOString()` → `"2026-07-16T18:15:00.000Z"` —
one day early. This is the same bug class the backend already fixed via
`formatLocalDate()` (see `CLAUDE.md`'s FIX-2 entry) but on the web frontend,
apparently never caught.

`BsDateInput` is used across the admin app (student admission dates, fee
due dates, and more) — fixing it is broad-blast-radius and out of this
phase's scope. Not touched. The new Task 5 attendance-calendar screen does
its own BS-month-to-AD-range conversion and was built with a small local
`formatLocalDateAd()` helper (direct `getFullYear()/getMonth()/getDate()`
extraction, zero-padded) instead of reusing `BsDateInput`'s buggy pattern,
so this phase does not propagate the bug into new code. Flagged here as a
real, live, reproducible bug worth a dedicated future fix — likely affects
every BS date picked near a BS-month boundary for any user/session in a
UTC+ timezone, which is most of this product's actual user base (Nepal).

4. Design-token gap — `warning-700` undefined, followed as established convention

`app/globals.css` defines the `warning` color scale only up to `-600`
(`success`/`error`/`brand` all also define `-700`). `components/shared/
status-badge.tsx` itself, plus several pre-existing admin pages
(`app/(school)/academic/page.tsx`, `app/super-admin/audit/page.tsx`), and
the pre-existing teacher assignments screens already reference
`text-warning-700`/`bg-warning-700` classes with no defined CSS variable
behind them. Two Phase 4 screens (Task 5's attendance calendar, Task 8's
assignment detail "locked" note) were instructed to reuse the same
success/error/warning/brand families `StatusBadge` already uses, and
correctly followed this established (if flawed) convention rather than
inventing a different treatment — deviating would have made these two new
screens visually inconsistent with the rest of the app. Not fixed here;
flagged for whoever eventually audits the design-token file.

5. Async-gate/hydration-guard bug class — watched for, not newly instanced this phase

The four prior occurrences (Phase 2's `useStudents`/`useAssignments` query-
enablement races, Phase 3's My Leave render-branch race) were all
retrofitted fixes to already-shipped code. This phase built the two real
async-dependency points — Task 4's timetable screen (`sectionId` resolves
from `useStudentMeProfile()` before the timetable query can fire) and Task
9's dashboard greeting (`profile` resolves before the name can render) —
with the correct guard shape from the start (`!value || isLoading`), so
there was no shipped-then-fixed instance to add a regression test for in
this phase. Task 4's review DID catch a related but distinct gap:
`useStudentMeProfile()`'s own `isError` wasn't originally surfaced, so a
genuine backend outage would have misrendered as a false "not enrolled"
state — fixed in the same task before merge. Per the standing instruction
from the Phase 3 follow-up: no shared test helper was built this phase
either, for the same reason as before (still only a handful of instances,
and this phase's two real cases were prevented rather than fixed
after-the-fact, so there was nothing to regression-test).

6. Full round-trip live proof (headline requirement)

Real Playwright browser session (headless Chromium, not curl) against the
running dev stack, demo tenant, both `student@demo.school` and
`teacher@demo.school` shimmed/verified/restored (401-proven after
restoration):

1. Logged in as the demo student via the real login form (school-slug +
   email + password fields).
2. Visited all 6 screens in sequence (Dashboard, Timetable, Attendance,
   Notices, Results, Assignments) — each rendered real backend data with no
   console errors (screenshots captured for all 6, plus the assignment
   detail/submit/review states).
3. Opened a real PUBLISHED assignment ("Chapter 4 Practice Problems",
   crafted fixture for this proof, Grade 9 A / Mathematics) and submitted a
   real text answer through the actual submission form.
4. Postgres read-back: `assignment_submissions` row created,
   `status = 'SUBMITTED'`, `text_answer` matches what was typed.
5. Logged out, logged in as the demo teacher, navigated to the **existing,
   unmodified Phase 2** `/teacher/assignments/:id` review screen — the
   Phase-4-submitted content was visible there (student name, submitted
   date, status, full answer text), proving the two portals' data actually
   round-trips through the same backend contract.
6. Reviewed it through that real UI (marks: 9, feedback text) — toast
   confirmed "Review saved — the student has been notified."
7. Postgres read-back: `status = 'REVIEWED'`, `marks = 9.00`, `feedback`
   matches, `reviewed_by` = the demo teacher's user id, `reviewed_at`
   populated. Two `notifications` rows also created (student + a linked
   guardian), confirming PUSH-1's mirror-rule event pipeline fired
   correctly for this new write path.
8. Logged back in as the student, reloaded the assignment — rendered fully
   read-only (`REVIEWED`, "9 marks", teacher feedback shown), no
   submit/resubmit form present.
9. IDOR probes (raw HTTP, deliberately not through the UI): a second
   crafted PUBLISHED assignment scoped to a different section
   (Grade 9 B, the student is in Grade 9 A) — confirmed absent from the
   student's own `GET /assignments/me` list; a direct `POST .../submissions`
   against it returned `403 FORBIDDEN_SCOPE` with zero rows created
   (confirmed by Postgres read-back); a direct `GET /assignments/:id`
   against the same id returned `403 FORBIDDEN_ROLE` (confirms the "no
   student-scoped single-assignment GET" claim this phase's detail-page
   design relies on).
10. All crafted rows (2 assignments, 1 submission, 2 notifications) deleted
    with read-backs confirming zero remain; both shimmed passwords restored
    with 401 proof.

Final counts: **667/667 api tests** (was 665 at end of Phase 3 — +2 for the
timetable IDOR fix's regression tests), **317/317 web tests** (unchanged —
pure-frontend screens, no new unit-testable logic beyond what Task 1's
backend fix already covers; live HTTP + Postgres + Playwright was the
verification method for the screens themselves, matching Phase 3's
precedent for pure-frontend phases), `tsc --noEmit` clean.
