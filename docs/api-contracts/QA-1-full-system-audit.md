# QA-1 — Full-System Feature Audit & Fix

**Save this file to:** `docs/api-contracts/QA-1-full-system-audit.md`

---

## Mission

Systematically verify every shipped feature of Aaramva Shikshya with **live proof** (real HTTP calls + Postgres read-backs), across all roles (admin/web, teacher/student/parent mobile API), fix every bug found, and leave the system with zero known broken features. This is an audit-and-repair session, not a build session — do not add new features.

## Ground Rules (non-negotiable)

1. **Live proof only.** A feature counts as WORKING only when proven by: (a) a real HTTP call against the running API returning the expected `{ success, data, meta }` shape, and (b) for writes, a `psql` `SELECT` read-back showing the row in the tenant schema. Passing unit tests alone prove nothing — they have missed SQL-level bugs four times before.
2. **Raw output required.** Paste raw terminal output for every verification (curl/httpie responses, psql rows, `tsc --noEmit`, test counts). Never summarize as "clean" without the raw evidence above it.
3. **Stop conditions.** If any ambiguous product decision arises (e.g., "should a librarian role exist?", "should overdue fines apply on Saturdays?"), STOP, log the question in the checkpoint report, and wait for Srijan. Never guess.
4. **No GitHub actions** beyond `git push`. Never merge PRs.
5. **Skip entirely:** SMS features (do not send, do not test Sparrow SMS). Live eSewa/Khalti sandbox payments (those are governed by PAY-1/PAY-2 gates) — for payments, verify only that initiation endpoints respond correctly and signatures/payloads are well-formed.
6. **Do not build missing modules.** If a module's endpoints don't exist (e.g., REP-1 not yet executed), mark every feature in it as `NOT_BUILT` in the matrix and move on.
7. **Nepal conventions are test criteria**, not decoration: all timestamps computed in `Asia/Kathmandu` (UTC+05:45 — not +05:30), BS dates displayed / AD stored (verify at least one BS conversion per date-bearing module against the `packages/bs-calendar` lookup, flag anything suspicious for manual hamropatro check), Sunday–Friday school week, money as `NUMERIC(10,2)` never floats, soft deletes via `deletedAt` only.
8. **Checkpoints.** At the end of every phase: commit, run full test suite + `tsc --noEmit` (API and mobile workspaces), print the phase matrix, then STOP and report. Wait for "continue" before the next phase.

## Bug Protocol

When any check fails:

1. Append a row to `docs/api-contracts/QA-1-BUGS.md`:
   `| # | Module | Feature | Repro (exact command) | Expected | Actual | Root cause | Fix commit | Re-verified (raw output ref) |`
2. Diagnose root cause (check the known recurring classes first: snake_case↔camelCase mismatches, static-vs-parameterized route shadowing, `::uuid`/`::date` cast bugs, timezone math using +05:30, `.data.data.data` pagination extraction).
3. Fix minimally. No opportunistic refactors.
4. Re-run the exact failing command; paste raw before/after output.
5. Run the full test suite (baseline: 485 passing). If the fix requires a test change, add a regression test that would have caught the bug.
6. If a fix would touch >5 files or change an API contract consumed by web/mobile, STOP and report first.

## Phase 0 — Environment + Known Bug: Assignment File Upload

**0.1 Bring up the stack** (Postgres 17, Redis, MinIO, API). Paste startup logs. Verify MinIO health and bucket existence explicitly — the reported bug is: *creating an assignment fails with a file-upload error*.

**0.2 Seed a dedicated QA tenant** (e.g., schema `qa_demo`) with:
- 1 admin, 2 teachers, 2 classes with sections, 4 students (2 per class, in different families), 2 parents (each linked to their own children only — needed for cross-family 403 probes), subjects, a running academic year/term with BS-correct dates.
- Capture tokens for each role. Mobile roles must authenticate with `X-Client-Type: mobile` and receive tokens in the response body (verify no httpOnly cookie is set for mobile; verify web login does NOT return tokens in body).
- Record all seeded IDs in `docs/api-contracts/QA-1-SEED.md` for cleanup.

**0.3 Reproduce the assignment upload bug.** As a teacher (mobile headers), create an assignment with an attached file (PDF and an image; test both). Paste the raw failing response and API logs. Diagnose (likely suspects: MinIO credentials/bucket/policy, multipart parsing vs body limit, content-type validation, presigned URL flow, base64 legacy path). Fix per Bug Protocol. Prove the fix: create → 201 → `SELECT` the assignment row and file record → download the file back via the API and verify byte size matches upload.

**CHECKPOINT 0.**

## Phases 1–9 — Module Sweeps

For **every** module, execute the standard matrix below, then the module-specific checks. Record results in a running table in `docs/api-contracts/QA-1-RESULTS.md`:

`| Module | Feature | C | R | U | D | Admin(web) | Teacher(mob) | Student(mob) | Parent(mob) | Scoping 403 proof | Status |`

Cell values: `PASS` / `FAIL→FIXED(bug#)` / `FORBIDDEN-CORRECT` (role correctly gets 403/absent) / `NOT_BUILT` / `N/A`.

**Standard matrix per feature:**
- **Create** with valid payload → 201 → psql read-back. Create with invalid payload (missing required field, bad date, negative money) → 400 with useful message, and psql proof nothing was written.
- **Read** single + list. Verify list pagination shape (`.data.data.data`), page/limit behavior, and that soft-deleted rows are excluded.
- **Update** → 200 → psql read-back shows changed values and untouched `createdAt`.
- **Delete** → soft delete only: psql shows `deletedAt` set, row not hard-deleted; subsequent GET excludes it.
- **Role scoping:** for every student/parent-readable resource, run a live cross-family probe (parent A requests child of family B) → must be 403. Paste it. Teacher writes must carry accountability stamps (`marked_by_user_id` / `entered_by_user_id`) — verify in psql.
- **Route shadow check:** if the module has both static and parameterized routes (e.g., `/students/stats` and `/students/:id`), hit the static one and confirm it doesn't get swallowed.

### Phase 1 — Students
Admissions (including **photo upload → verify file actually persisted in MinIO and retrievable**, given the past silently-discarded-photo bug), student profiles, class/section assignment, family/guardian linking (verify guardian field casing end-to-end), promotion/transfer if present. Student app: own profile read; Parent app: own children only.

### Phase 2 — Attendance
Teacher marks attendance (mobile) for their class; verify `marked_by_user_id`. Date handling: mark attendance "today" and verify the stored AD date and displayed BS date are correct in Kathmandu time — explicitly test near-midnight boundary logic in code review if a live test isn't feasible (the +05:45 off-by-one bug lived here). Verify Saturday is treated as the weekend, Sunday is a school day. Student/parent apps: read own/child attendance calendar + summary %. Cross-family probe. Verify any attendance cron/scheduled job is alive: trigger or inspect BullMQ/schedule registration and paste evidence (a cron died silently before).

### Phase 3 — Academic
Classes, sections, subjects, teacher-subject-class mapping, routine/timetable if present (verify Sunday–Friday structure), academic years/terms with BS dates. Verify term date boundaries stored as AD.

### Phase 4 — Assignments (EDU-1/EDU-2 full sweep)
Beyond the Phase 0 fix: teacher creates/edits/deletes assignment (scoped to their own classes — verify a teacher cannot edit another teacher's assignment if that's the contract; if ambiguous, STOP and ask), student views + submits (with file), teacher grades/returns, parent views child's assignment status. File lifecycle both directions. Due-date display in BS.

### Phase 5 — Finance
Fee structures (fix the known **`dueDate` text-vs-date cast bug** here per Bug Protocol — it's in the backlog and this is its phase), invoice generation, discounts/scholarships if present, payment recording (manual/offline payments), fine computation (verify the fine cron is registered and runs — paste scheduler evidence), student/parent app fee views (own family only, cross-family 403 probe on invoices — money data is the highest-stakes IDOR surface). eSewa/Khalti: initiation endpoints only — well-formed payload/signature, correct redirect/params; do NOT attempt live sandbox payment. All amounts `NUMERIC(10,2)` in psql read-backs; grep the finance module for any float arithmetic on money and flag it.

### Phase 6 — Examinations
Exam setup, marks entry (teacher, mobile — verify `entered_by_user_id`), marks validation (out-of-range rejection), results/report-card pipeline end-to-end: enter marks → generate result → student/parent app can fetch own report card, cross-family 403 probe. If report cards render PDFs, generate one and verify the file exists and opens (non-zero size, valid PDF magic bytes).

### Phase 7 — Reports
If REP-1 has not been executed: mark all `NOT_BUILT`, note it, move on. If it exists: verify BS-month bucketing correctness against `packages/bs-calendar` (pick a month whose AD span crosses two Gregorian months and prove the bucket boundaries), plus the standard matrix on whatever report endpoints exist.

### Phase 8 — HR & Staff
Staff records CRUD, roles/permissions, leave approval loop end-to-end: staff applies → approver sees pending → approve/reject → status reflected in applicant's view → psql read-back of the state transitions. Verify a non-approver cannot approve (live 403).

### Phase 9 — Library
Books CRUD, issue/return flow, due dates (BS display), overdue handling if present, member scoping (student sees own issued books only, cross-student probe). If fines exist here, `NUMERIC(10,2)` check.

### Phase 10 — Dashboard & Cross-Cutting
Dashboard stats endpoints for each role return correct aggregates — verify at least two numbers against direct psql counts (e.g., total students, today's attendance %). Per-tenant theming endpoint responds. Push notification registration endpoint accepts a token (do not send real pushes unless a dry-run mode exists). File storage: list the five known legacy base64 blobs and confirm scope (report only — migration is a separate session). Global: run one request against a second tenant schema to prove tenant isolation (data from `qa_demo` must not leak).

## Phase 11 — Regression, Mobile TS, Cleanup, Final Report

1. Full test suite — paste raw count (baseline 485; must be ≥ baseline, all green).
2. `tsc --noEmit` on API, web, and mobile workspaces — paste raw output.
3. **Cleanup:** delete the `qa_demo` tenant schema and every seeded artifact per `QA-1-SEED.md`; paste psql proof the schema is gone. Remove any test files from MinIO.
4. Commit + push. Never merge.
5. **Final report** printed to terminal AND saved to `docs/api-contracts/QA-1-REPORT.md`:
   - Full results matrix
   - Bug table with root causes and fix commits
   - Open questions from stop-conditions
   - **Manual on-device checklist for Srijan** — a short numbered list of the UI-only flows Claude Code could not verify (e.g., "Teacher app: attach a photo from camera to an assignment and submit — expect success toast"), written in baby-step form.

## Exit Criteria

QA-1 is DONE only when: every matrix cell is `PASS`, `FORBIDDEN-CORRECT`, `NOT_BUILT`, or `N/A` (zero unresolved `FAIL`); test suite ≥ 485 green; `tsc --noEmit` clean on all three workspaces; QA tenant cleaned up with proof; report file committed.
