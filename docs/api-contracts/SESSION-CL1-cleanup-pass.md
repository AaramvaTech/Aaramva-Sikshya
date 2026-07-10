# SESSION-CL1 — Cleanup Pass

**Type:** Small fixes — clear the lingering loose threads so the board's clean before feature/UX work. Each live-proven.

**Source of truth:** the running backlog — `useSectionStudents` limit; dashboard exam-time 1970 bug; the 2 pre-existing failing tests.

**Pre-req:** commit the uncommitted WV-1 finance fix + MIG1 migration files first, so these fixes land as a separate, clean commit.

---

## Hard rules

1. **Step 0 read-and-report per item** before fixing.
2. **Live-prove the two functional fixes** (don't trust unit tests alone).
3. **Failing tests: diagnose root cause, fix properly.** Real bug → fix the code and keep the test. Stale/wrong test → correct it to match intended behavior. **Never** make them pass by deleting/skipping assertions — that hides problems. If a failure reveals a genuine product bug too big for a quick fix, **flag it for its own session** and leave it red with a note rather than faking green.
4. `tsc` + **full test suite genuinely green** at the end.

---

## Task 1 — `useSectionStudents` limit

The hook requests `limit: 200`; the students endpoint caps `limit ≤ 100` → 400. This backs the student roster on **Mark Attendance** and **Marks Entry**.

- Confirm it actually breaks the roster (live, as the demo teacher: make the hook's call → 400).
- Fix: request `limit: 100` (or paginate if a section can exceed 100).
- **Prove:** the roster loads (200) on both screens as the demo teacher.

## Task 2 — Dashboard exam-time 1970 bug

`dashboard.service.ts` ("upcoming exams") emits raw `Date → 1970` strings — same class as the timetable fix (R2). Wrap start/end with the shared `toTimeString`/`toTimeField`.

- **Prove:** with a **future-dated** exam present (seed/ensure one — the bug only triggers on upcoming exams), GET the dashboard endpoint → times render as clean `HH:MM`, not the 1970 string.

## Task 3 — The 2 failing tests (library/issue, student-attendance)

- **Step 0:** run them, read the failures, diagnose **why** each fails.
- Fix properly per rule 3 (code bug → fix code; stale test → correct test). No faking green.
- If a failure exposes a real product issue beyond this pass's scope, flag it for its own session.
- **Goal:** the full suite is genuinely green.

---

## Verification

- **Task 1:** live 400 → 200 roster proof on both teacher screens.
- **Task 2:** live dashboard times clean (with a future exam).
- **Task 3:** full suite green; per test, state the root cause and the fix (bug-fixed vs test-corrected).
- `tsc --noEmit` clean.
- Verdict per task.
