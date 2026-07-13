# QA-1 — Results Matrix

Cell values: `PASS` / `FAIL→FIXED(bug#)` / `FORBIDDEN-CORRECT` / `NOT_BUILT` / `N/A`.
Tenant: `qa-demo` (schema `tenant_qa_demo`). See `QA-1-SEED.md` for IDs.

`| Module | Feature | C | R | U | D | Admin(web) | Teacher(mob) | Student(mob) | Parent(mob) | Scoping 403 proof | Status |`

## Phase 0 — Environment + Assignment file upload

| Module | Feature | C | R | U | D | Admin | Teacher | Student | Parent | Scoping 403 | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Storage/FILE-1 | MinIO health + bucket | — | PASS | — | — | — | — | — | — | — | PASS (0.1) |
| Auth | register-school (public) | PASS | — | — | — | PASS | — | — | — | — | PASS |
| Auth | login mobile vs web (cookie semantics) | — | PASS | — | — | web:no-body-token+cookie | mob:body-token+no-cookie | mob | mob | — | PASS |
| Assignments | create w/ attachment (PDF+PNG) | PASS | PASS(download-back byte-exact) | — | — | — | PASS | — | — | (Phase 4) | PASS |

**Phase 0 result:** stack up (Postgres 17 / API / web / MinIO; Redis disabled-by-design). qa-demo seeded (4 students/2 families, 2 teachers, 2 parents, 2 student logins). Assignment upload **works end-to-end** once MinIO is running — reported failure was MinIO-down (BUG-1, environmental). No code changes.

Full Assignments CRUD + scoping matrix is deferred to **Phase 4**. Standard per-feature CRUD/scoping matrices for each module follow in Phases 1–10.

## Phase 1 — Students

Fixes landed this phase (commit **8611d5b**): **BUG-1** `/health` storage reachability + startup warn → **FIXED**; **OBS-A** guardians soft-delete column → **FIXED** (migration 0008). Details in `QA-1-BUGS.md`.

| Module | Feature | C | R | U | D | Admin | Teacher | Student | Parent | Scoping 403 | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Students | Admission | PASS (`created_by`=owner) | PASS | PASS | PASS (soft) | PASS | R-only 200 | N/A | N/A | parent/student `:id`→403 | PASS |
| Students | Invalid payload | 400 + no-write | — | — | — | PASS | — | — | — | — | PASS |
| Students | Photo upload (MinIO persist+retrieve) | PASS (key stored, not base64) | PASS (byte-exact 68 B) | — | — | PASS | — | — | — | — | PASS |
| Students | Profile read (single/list/pagination) | — | PASS (`.data.data`+`.data.meta`, soft-del excluded) | — | — | PASS | 200 | own via /me | own via my-children | — | PASS |
| Students | Guardian linking (casing) | — | PASS (camelCase `firstName/isPrimary`) | — | — | PASS | — | — | — | — | PASS |
| Students | Enroll (class/section assign) | PASS (→Grade 10-A) | — | — | — | PASS | — | — | — | — | PASS |
| Students | Student `/me` (own profile) | — | PASS | — | — | — | — | PASS (own only) | — | no id param (THE ONE RULE) | PASS |
| Students | Parent `my-children` (own only) | — | PASS | — | — | — | — | — | PASS (only S1) | cross-family excluded | PASS |
| Students | Route-shadow `/students/stats` | — | PASS (200, not `:id`) | — | — | PASS | — | — | — | — | PASS |

**Phase 1 result:** all cells PASS. Accountability stamp (`created_by`) proven; soft-delete proven (row present + `deleted_at` set + excluded from GET/list/stats); photo round-trips to MinIO byte-exact (no silent discard); guardian casing correct end-to-end; role scoping correct (parent/student `:id`→403, teacher roster 200; `/me` + `my-children` own-only).

- **OBS-B (flagged, FIX-3):** student DOBs render BS in the 2067 era (e.g. `2010-05-20 → 2067-02-07`), inside the FIX-3 documented off-by-one window. Consistent internal use of `adToBs`; cross-check vs hamropatro before trusting historical BS DOBs. Not fixed (FIX-3 is its own pass).
- **OBS-C (minor, tracked):** the student *status* enum differs across surfaces — list-query `['ACTIVE,PASSED_OUT,EXPELLED,TRANSFERRED,DROPPED']` vs `stats.byStatus` keys `ACTIVE/INACTIVE/TRANSFERRED/GRADUATED`. No functional failure; a cosmetic enum-consistency nit. Revisit if it surfaces in a status-update flow. **(Phase 10: upgraded to a verify-and-maybe-fix — see QA-1-BUGS.md OBS-C.)**

## Phase 2 — Attendance

**Scheduling (decision 4):** BullMQ is **fully removed** (OPS-1) — zero `bullmq`/`Queue`/`Processor` in the codebase. The only scheduled job is `@nestjs/schedule` `@Cron('5 0 * * *', tz Asia/Kathmandu)` (fine recalc). Proven via a throwaway `SchedulerRegistry` probe: **1 cron registered `recalculate-fines`, next fire `2026-07-14T00:05:00.000+05:45`** (armed, Nepal-tz). With Redis temporarily enabled (WSL redis 7.0.15), `HealthService.check()` → `redis:{up,33ms}`, storage up, db up, overall `ok` — the live redis path works. **No BullMQ queue exists to verify** → cron is NOT N/A. Attendance itself has **no** dedicated cron (its background work is event-driven: `attendance.absent` → listener → in-app/push; SMS is MOCK, none sent).

| Module | Feature | C | R | U | D | Admin | Teacher | Student | Parent | Scoping 403 | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Attendance | Mark student attendance (bulk UPSERT) | PASS (`marked_by`=teacher) | PASS | PASS (re-UPSERT) | N/A (UPSERT, no soft-del) | PASS | PASS (mobile) | N/A | N/A | — | PASS |
| Attendance | Future-date guard | 400 (`"future dates"`) | — | — | — | — | PASS | — | — | — | PASS |
| Attendance | Date AD-stored + BS display (Kathmandu) | PASS (`2026-07-13` AD → BS `2083-03-29`) | PASS | — | — | — | PASS | PASS | PASS | — | PASS |
| Attendance | Student own summary/history (`/me`) | — | PASS (100%, /me) | — | — | — | — | PASS (own) | — | no id param | PASS |
| Attendance | Parent child summary/history | — | PASS (own child) | — | — | — | — | — | PASS | cross-family **403/403** | PASS |
| Attendance | Teacher section report | — | PASS (grid + per-student %) | — | — | PASS | PASS | — | — | — | PASS |
| Attendance | Cron/schedule alive | — | PASS (SchedulerRegistry, armed) | — | — | — | — | — | — | — | PASS |

**Phase 2 result:** all cells PASS. `marked_by` accountability stamped; AD date stored exactly + BS display modern-era-correct; future-date rejected; student/parent own-scope + cross-family 403; cron armed (not silently dead).

- **OBS-D (Attendance weekend enforcement — flagged, product decision):** `bulkMark` only rejects **future** dates; it does **not** reject **Saturday** (Nepal's weekly holiday) — marking on Sat `2026-07-10` returned **201**. Working-days = distinct actually-marked dates (self-consistent), so the % stays correct *as long as Saturdays aren't marked*. The mobile timetable has a Saturday guard but attendance marking does not. **Low severity**; product decision whether the backend should reject Saturday marks (or a school-calendar/holiday table should drive working-days). Not changed in QA-1 (STOP-condition: ambiguous product decision).
- **OBS-E (UTC-today in getSchoolSummary) — FIXED (b8d1bf9):** now uses `todayAdInNepal()`; mocked-clock regression test proves the Nepal date at 00:30 +05:45. Remaining ~10 UTC-today sites DEFERRED → FIX-2-continuation (list in QA-1-BUGS.md). OBS-D recorded **INTENTIONAL** (CAL-1 school-calendar backlog).

## Phase 3 — Academic

| Module | Feature | C | R | U | D | Admin | Teacher | Student | Parent | Scoping | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Academic | Academic year (+set-current, BS/AD) | PASS (AD stored; `2026-07-16`=1 Shrawan 2083) | PASS (`/current` route-shadow ok) | PASS (rename + set-current flip/restore) | PASS (soft) | PASS | read | read | read | non-admin write→403 | PASS |
| Academic | Class | PASS | PASS | PASS | PASS (soft) | PASS | read (write 403) | read | read | teacher POST→403 | PASS |
| Academic | Section | PASS | PASS | PASS (capacity) | PASS (soft) | PASS | read | read | read | — | PASS |
| Academic | Subject | PASS | PASS | PASS | PASS (soft) | PASS | read | read | read | — | PASS |
| Academic | Class-subject mapping | PASS (full/pass marks) | PASS (count) | — | PASS (remove) | PASS | read | read | read | — | PASS |
| Academic | Timetable/routine (Sun–Fri) | PASS | PASS (day-keyed `schedule`; `/my`,`/my/sections`) | — | PASS | PASS | self-scoped | read (`/section/:id`) | read | — | PASS |

**Phase 3 result:** all cells PASS. Academic-year dates AD-stored + BS modern-era-correct (1 Shrawan 2083 fiscal start); full CRUD + soft-delete on class/section/subject; class-subject mapping; timetable day-keyed Sun–Fri structure with self-scoped teacher routes; admin-write / all-read scoping enforced (non-admin write → 403). **No separate `terms` entity** — the fiscal `academic_year` is the term container (exam_types provide exam periods). Timetable accepts `dayOfWeek=6` (Saturday) — backend-permissive, tracked under OBS-D/CAL-1.
