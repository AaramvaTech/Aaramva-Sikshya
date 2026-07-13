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

## Phase 4 — Assignments (EDU-1/EDU-2)

**Fix landed (decision 3):** cross-teacher assignment edits were soft-scoped but recorded **no actor**. Migration **0009** adds `assignments.updated_by` (canary demo→all 7); `update`/`publish`/`close` now stamp `updated_by`=actor (controller passes `@CurrentUser`). Review already stamped `reviewed_by`. **4 files + 1 regression test.** Proven live below.

| Module | Feature | C | R | U | D | Admin/Teacher | Student(mob) | Parent(mob) | Scoping 403 | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| Assignments | Create (+attachment, BS due) | PASS (`created_by` stamp; due `2026-07-25`→BS 2083-04-10) | PASS | — | — | PASS | — | — | — | PASS |
| Assignments | Edit (own + cross-teacher) | — | — | PASS (**`updated_by`=actor**; author unchanged) | — | PASS (soft-scope) | — | — | — | PASS |
| Assignments | Publish / Close | — | — | PASS (edge-only event; `updated_by` stamped) | — | PASS | — | 409 resubmit after close | — | PASS |
| Assignments | Soft-delete | — | — | — | PASS (`deleted_at`, GET→404) | PASS | — | — | — | PASS |
| Assignments | Student list `/me` + submit(file) | PASS (submission) | PASS | — | — | — | PASS (targeted only) | — | cross-section not visible; submit→403 | PASS |
| Assignments | Submission-file presign (scopedOnly) | — | — | — | — | — | assignment-scoped 201 | — | **generic /files route→403** | PASS |
| Assignments | Teacher submissions view + missing | — | PASS (submitted 1 + missing list) | — | — | PASS | — | — | — | PASS |
| Assignments | Review/grade | — | — | PASS (**`reviewed_by`=actor**, →REVIEWED) | — | PASS (cross-teacher) | sees marks/feedback | — | — | PASS |
| Assignments | Parent child status | — | PASS (own child marks/feedback) | — | — | — | — | PASS | own children only | PASS |
| Assignments | File lifecycle both directions | — | PASS | — | — | teacher↓submission 68B | student↓attachment 69B | — | byte-exact | PASS |

**Phase 4 result:** all cells PASS. Full DRAFT→PUBLISHED→CLOSED + submit→review lifecycle; **soft-scoped teacher writes now accountable** (`updated_by`/`reviewed_by` = actor, per decision 3 — fixed by adding the stamp, no block added); student/parent **hard-scoped** (cross-section not visible, submit→403, `/me` + `my-children` own-only); submission-file `scopedOnly` enforced (generic presign→403); file lifecycle byte-exact both directions; BS due-date conversion modern-era-correct.

## Phase 5 — Finance

**Fixes/findings this phase:** OBS-E-2 UTC-today **FIXED** (report ×2, invoice-create default, `recalculateFine`, fine-cron pre-filter → `todayAdInNepal()`; 4 files + 2 mocked-clock tests). dueDate cast bug **verified already-fixed** (no un-cast DATE write exists). **BUG-3 (JS-float money math) CONFIRMED — not fixed inline, needs remediation-approach decision** (see QA-1-BUGS.md; surfaced at checkpoint).

| Module | Feature | C | R | U | D | Admin | Student | Parent | Scoping 403 | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| Finance | Fee category / structure | PASS (`amount 1000.00` NUMERIC) | PASS | — | (soft, OWNER) | PASS | — | — | — | PASS |
| Finance | Discount / scholarship | PASS (20% → `discount 200.00` exact) | PASS | — | — | PASS | — | — | — | PASS |
| Finance | Invoice generate (+dueDate cast) | PASS (`subtotal/total` NUMERIC; `$4::date`) | PASS | — | PASS (soft, WAIVED) | PASS | — | — | — | PASS |
| Finance | Payment record (manual/CASH) | PASS (`received_by` stamp; `balance` generated) | PASS | — | (soft, OWNER) | PASS | — | — | — | PASS |
| Finance | **Fine cron EXECUTION** | — | — | PASS (recalc → **`fine 120.00` NUMERIC, Nepal-date, OVERDUE**) | — | PASS | — | — | — | PASS |
| Finance | Parent fee views (assignments/ledger) | — | PASS (own child) | — | — | PASS | N/A (no student finance view) | PASS (own) | **cross-family S3 → 403/403** | PASS |
| Finance | eSewa initiate (initiation-only) | PASS (INITIATED txn, amount server-computed 300) | PASS (**HMAC signature match**) | — | — | PASS | — | PASS (own invoice) | **cross-family invoice → 403** | PASS |
| Finance | Khalti initiate (disabled) | FORBIDDEN-CORRECT (503, no key) | — | — | — | — | — | — | — | PASS |
| Finance | payment-gateways (route-shadow safe) | — | PASS (`{esewa:true,khalti:false}`) | — | — | PASS | — | PASS | — | PASS |

**Phase 5 result:** all cells PASS. **Fine-cron execution proven** (not just registration): overdue invoice → `recalculate-fine` → `fine 120.00` (12 days × Rs10) NUMERIC(10,2), status OVERDUE, computed against **Nepal-today** via the OBS-E-2 fix. Money is NUMERIC(10,2) throughout (discount/fine exact in the observed cases). Cross-family 403 mandatory-probes all pass (assignments, ledger, eSewa initiate). eSewa initiation verified **signature-correct** (recomputed HMAC-SHA256) with server-computed amount and an INITIATED audit row — **zero live gateway calls**; Khalti correctly 503s (disabled). No route-shadow (`payment-gateways` is top-level).

- **OBS-F (additional UTC-today sites found, flagged):** `payment.service.ts:28-31` `deriveStatus` (OVERDUE-vs-UNPAID, server-local `new Date()`) and `invoice.service.ts:146` / `payment.service.ts:70` `getBsYear(new Date())` (BS-year for invoice/payment numbering) are further finance "today" sites not in OBS-E-2's explicit scope. Low impact (status re-derived on recalc; BS year changes once/yr). Should migrate to `todayAdInNepal()` in the same eventual pass; not fixed here to keep the OBS-E-2 fix ≤5 files.
- **BUG-3 (JS-float money) — see QA-1-BUGS.md.** Confirmed bug class; STOP-and-report (architectural). **Decision needed:** Decimal library vs integer-paisa vs SQL-side computation.

## Phase 6 — Examinations

No code changes this phase — the module is correct end-to-end (incl. the publish privacy gate and PDF).

| Module | Feature | C | R | U | D | Admin/Teacher | Student | Parent | Scoping 403 | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| Exams | Setup (grading scale / type / schedule) | PASS | PASS | PASS (rename/publish) | PASS (soft) | PASS | — | — | — | PASS |
| Exams | Marks entry (teacher, `entered_by`) | PASS (`entered_by`=teacher1) | PASS | PASS (UPSERT) | — | PASS (mobile) | — | — | — | PASS |
| Exams | Out-of-range mark rejection | 400 (`"marksObtained (150) exceeds fullMarks (100)"`) + **psql no-write** (S1 unchanged 85) | — | — | — | PASS | — | — | — | PASS |
| Exams | Result pipeline (marks→grade→rank) | PASS (85%→A→rank1, 60%→B→rank2, absent→E→rank3) | PASS | — | — | PASS | — | — | — | PASS |
| Exams | **Publish privacy gate** | — | PASS | PASS (publish toggle) | — | staff see all | **published-only** (n=0 unpublished → n=1 published) | **published-only** | — | PASS |
| Exams | Report card (JSON) | — | PASS | — | — | PASS | PASS (`/me`, own) | PASS (own child) | **cross-family S3 → 403** | PASS |
| Exams | Report card **PDF** | — | PASS (`%PDF-`, 23964 B, round-trip) | — | — | PASS | PASS (`/me/pdf`) | PASS | **cross-family PDF → 403** | PASS |

**Phase 6 result:** all cells PASS, no code changes. Marks entry stamps `entered_by`=teacher; out-of-range marks rejected 400 with psql proof of no write; full pipeline verified; publish privacy gate proven; report-card JSON + PDF valid; cross-family → 403.

## Phase 7 — Reports (REP-1)

No code changes — the report module is clean (no UTC-date truncation; `fee-aging asOf = todayAdInNepal()`, `bsMonthBucket`/`isoDate` operate on DB DATE values per FIX-2, `exam.publishedAt.toISOString()` is a legit timestamp).

| Module | Feature | Read | Roles | Scoping 403 | Status |
|---|---|---|---|---|---|
| Reports | **Attendance trends — BS-month bucketing (boundary)** | PASS | ACADEMIC_REPORT_ROLES | teacher/student/parent → 403 | PASS |
| Reports | Attendance class-comparison / low / staff | PASS (200) | ACADEMIC_REPORT_ROLES | — | PASS |
| Reports | Exams published / summary / comparison / student-progress | PASS (summary: 3 students, passRate 66.7%, avg 48.3%) | ACADEMIC_REPORT_ROLES (published-only) | — | PASS |
| Reports | **Fee aging (asOf Nepal-correct)** | PASS (`asOf 2026-07-13`; overdue Rs1120 → 0-30 bucket) | FINANCE_REPORT_ROLES (+ACCOUNTANT) | teacher/student/parent → 403 | PASS |

**BS-month bucketing boundary proof (requirement 1):** seeded 1 attendance record on `2026-07-15` + 1 on `2026-07-16`; the trends report (`groupBy=bs-month`) split them into **two distinct buckets — `2083-03` "Ashadh 2083" (07-15) vs `2083-04` "Shrawan 2083" (07-16)** — the exact Ashadh(31)→Shrawan(1) boundary. Verified against `packages/bs-calendar` (`2026-07-15 → 2083-03-31`, `2026-07-16 → 2083-04-01`, modern-era FIX-3-safe); psql cross-checked; seeded rows cleaned (count 0).

**Phase 7 result:** all cells PASS, no code changes. BS-month bucket boundary correct (a cross-Gregorian-month BS month splits on the right AD day); fee-aging `asOf` is Nepal-today (`todayAdInNepal()`); all report endpoints 200 for admin tier with correct aggregates; **teacher/student/parent → 403** on every report endpoint (requirement 3). No UTC-date-truncation in the report/bucketing code (requirement 2 — grep clean). Marks entry stamps `entered_by`=teacher; **out-of-range marks rejected 400 with psql proof of no write**; full pipeline marks→result(grade/rank)→report-card verified (Aarav 85%→A→rank 1); **publish privacy gate proven** (parent/student see only published terms — `examResults` empty until publish; staff see all); report-card JSON + **PDF valid** (`%PDF-` magic, 23964 B non-zero, download round-trip) for student `/me` and parent own-child; **cross-family report-card + PDF → 403**.
