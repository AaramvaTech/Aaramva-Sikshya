# SESSION-R2 — Backend Cleanup

**Type:** Backend + seed cleanup. Closes the remaining backend/data debts surfaced across the wiring sessions. **No frontend wiring, no new screens.** Each fix is **live-proven** against real Postgres.

**Source of truth:** the audit, R1, M3.1 (D1), and **M5.1** (which proved live that the marks XOR hole is real).

---

## Hard rules

1. **Step 0 read-and-report before editing.**
2. **Live HTTP + Postgres proof for each fix** — not mocked. (The whole project runs on this rule; M5.1 just demonstrated again why.)
3. **Idempotent seed.**
4. Paste raw `tsc --noEmit -p tsconfig.build.json` + the live smoke output per task.

---

## Task 1 — Server-side marks XOR guard (confirmed data-integrity hole)

M5.1 proved live that `POST /exams/marks/bulk` with a one-sided split (theory set, practical null, `isAbsent:false`) returns **201** and persists `marks_obtained = NULL`. The XOR is currently client-side only and bypassable.

- In `marks.service.bulkEnterMarks`, add a server guard: for a **split** exam, **reject (400)** when exactly one of theory/practical is provided and `isAbsent` is false. Keep the existing `theory + practical == marksObtained` check.
- Clean up the corrupt `marks_obtained = NULL` row (and the test attendance rows) that M5.1's probes left in the demo tenant.
- **Live-prove:** one-sided split → **400**; valid both-sided → **201**; absent → **201**. Paste raw statuses + a SELECT confirming no NULL-`marks_obtained` split rows remain.

## Task 2 — Seed refresh (D1 staleness + credential drift)

The demo academic year is stale (`2081-82` while the BS context is 2083), and the teacher's stored hash had drifted off the documented `Teacher@123` (the idempotent seed skips existing users, so drift persists).

- Refresh the seed to the **current** academic year — **verify the correct label against your own year convention** before setting it, since admission IDs are composed from it.
- Make demo credentials **deterministic on reseed** (documented passwords for every demo role actually take effect, even if the user already exists).
- **Live-prove:** reseed, then log in as each demo role with the documented credentials, and confirm `/students/me` (student) reflects the current academic year. Paste statuses + the year value.

## Task 3 — Second demo child (prove the parent child-switcher)

The parent child-switcher is built and wired (M4) but unexercised — `parent@demo.school` has one child.

- Link a **second** child to that parent via the R1 guardian-provisioning path (idempotent).
- **Live-prove:** `GET /students/my-children` as the demo parent → **2 children**. Paste the result.

## Task 4 — Timetable time serialization at source (verify consumers)

Root cause of the old 1970 string: Prisma returns the Postgres `time` column as a Date, which stringifies to `Thu Jan 01 1970 …`.

- Change the timetable serialization to emit a plain `"HH:MM"` (or `"HH:MM:SS"`) string at the API boundary.
- **Mobile is already safe** — `lib/time.ts` handles clean strings — so this should not regress the apps. **Verify** anyway: after the change, confirm mobile timetable still renders (student/parent/teacher).
- **For web:** check whether the web frontend consumes these times and renders them. If it still renders correctly, confirm it. If web had its own Date-string workaround that now breaks, **do not fix web here** — report it for a separate web session.
- **Live-prove:** `GET` a timetable endpoint → times are now plain strings; one mobile render path confirmed correct.

---

## Not in scope

- No mobile wiring or screens. The `useSectionStudents` limit fix is a separate mobile task, not here.
- No new screens; no parent/teacher/student UI work.

---

## Output

Per task: raw live proof (status + SELECT/response), and a one-line verdict (fixed / done). `tsc` clean. If any live call surfaces an unexpected error, STOP and report.
