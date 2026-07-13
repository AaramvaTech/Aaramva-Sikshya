# QA-1 — Bug Log

`| # | Module | Feature | Repro | Expected | Actual | Root cause | Fix | Re-verified |`

## BUG-1 (Phase 0.3) — Assignment file upload "fails with a file-upload error" — **FIXED (8611d5b)**

Status: **FIXED in code** per architect decision (env-fix alone was not enough — storage down must be *visible*).

| Field | Value |
|---|---|
| **Module** | Assignments / Storage (FILE-1) |
| **Feature** | Create assignment with attached file (teacher, mobile) |
| **Repro** | With MinIO **not running** but `S3_*` env vars set: teacher `POST /files/presign-upload` (kind `assignment-attachment`) → `201`; then `PUT` the presigned URL → **fails** (`ECONNREFUSED 127.0.0.1:9000`); client surfaces an opaque "file-upload error". |
| **Expected** | Attaching a PDF/image to an assignment succeeds; file retrievable. |
| **Actual (pre-fix)** | Upload PUT died before reaching storage because the S3 backend was down. |
| **Root cause** | **Environmental, not a code defect.** `StorageService.onModuleInit` marks storage *enabled* whenever the four `S3_*` env vars are present — a boot-time env-presence check only, with **no reachability probe**. So `presign` returns `201` (pure local signing), and only the browser's *direct* PUT to `:9000` fails — producing a confusing client-side error rather than a clear 5xx from the API. MinIO in dev is a manual `minio.exe` (not a service), so it is down after any reboot. |
| **Fix (env)** | Started MinIO per `docs/ops/RUNBOOK.md` §"Local dev setup — MinIO" (Phase 0.1). |
| **Fix (code, 8611d5b)** | (1) `HealthService` probes the S3 backend (`HeadBucket`, 1.5s timeout) → new `storage` component (up/down/disabled) in `/health`; storage down → `degraded` (HTTP 200), only db down → 503; no per-presign probe. (2) `StorageService` logs a clear **startup WARN** when the backend is unreachable. 4 files + 3 regression tests. |
| **Re-verified (env)** | Phase 0.3: PDF+PNG each `presign 201 → PUT 200 → POST /assignments 201`; psql read-back (`attachment_keys` jsonb + `created_by`); API download-back byte-exact (200 B / 68 B); `mc stat` sizes match. |
| **Re-verified (code)** | `/health` storage `up` (MinIO on) → stop MinIO → `storage:down` + `status:degraded` + **HTTP 200** (not 503) → restart → `up`. Startup WARN captured live (`File storage backend UNREACHABLE … connect ECONNREFUSED 127.0.0.1:9000`), app still boots. Unit: HealthService storage up/down/disabled (3 cases). Suite 516/516. |

---

## OBS-A (Phase 1) — `guardians` missing the soft-delete column — **FIXED (8611d5b)**

| Field | Value |
|---|---|
| **Finding** | `guardians` had **no `deleted_at`** column, unlike other main entities. No guardian delete path existed at all (grep: zero `DELETE FROM guardians` / soft-delete). |
| **Fix** | Tenant migration **0008_guardians_soft_delete** adds `deleted_at TIMESTAMPTZ` + a partial index, applied canary(demo)→all 7 tenants. All six guardian reads in `guardian.service.ts` now filter `deleted_at IS NULL`. 3 files + 3 regression tests. |
| **Re-verified** | Column present in `tenant_qa_demo` + `tenant_demo`. Live: `parent1` `/students/my-children`=["Aarav"] & `/guardians/me` 200 → soft-delete guardian via psql → `my-children`=[] & `/guardians/me` **403** → restore `deleted_at=NULL` → child back. |
| **Scope note (flagged)** | ~9 cross-module guardian reads (communication listeners, finance report/invoice/sms, attendance leave scoping, assignment submission, storage file-access, examination result) do **not** yet filter `deleted_at`. Harmless today (nothing soft-deletes a guardian), but if a guardian-removal feature is added they must be swept. Left untouched now to respect the Bug-Protocol ≤5-file limit and avoid risky edits to scoping/audience queries. |

---

## BUG-4 (Phase 10) — 🔴 CRITICAL cross-tenant data leak (token/tenant not cross-checked) — **STOP-and-report (NOT fixed; needs architect decision)**

| Field | Value |
|---|---|
| **Severity** | **CRITICAL** — full multi-tenancy isolation break. A valid JWT from tenant A can **read and write any other tenant B's data** by sending `X-Tenant-Slug: B`. |
| **Repro (live-proven)** | qa-demo `SCHOOL_OWNER` token (tenantId `3d1c05c5…`, tenantSlug `qa-demo`) → `GET /students` with `X-Tenant-Slug: qa-demo` → qa_demo students ("Aarav Family1"…); the **same token** with `X-Tenant-Slug: demo` → **200 with DEMO's students** ("Aarav Shrestha", "Binod Gurung"…). Expected 401/403; got another tenant's data. |
| **Root cause** | `TenantMiddleware` (`tenant.middleware.ts`) resolves the schema **solely from `X-Tenant-Slug`/subdomain** and runs **before** auth (never sees the JWT). `JwtStrategy.validate` (`jwt.strategy.ts`) just echoes the token payload to `req.user`. **Nothing compares `req.user.tenantId` (token) against `req.tenant.tenantId` (resolved context).** Auth and tenant-context are fully decoupled → the query runs in whatever schema the header names. |
| **Blast radius** | Every authenticated tenant-scoped route. Any leaked/stolen/log-captured token becomes a cross-tenant skeleton key. Data-level isolation (search_path) is intact (BUG is the *selection* of tenant), and `GET /students/:id` for a foreign id 404s (I1) — but the header lets the token operate wholesale in the foreign schema. |
| **Proposed fix (for approval)** | Add a check, after both `TenantMiddleware` and `JwtAuthGuard` have run, comparing `req.user.tenantId` to `req.tenant.tenantId`; **reject 403 on mismatch**. Placement options: a dedicated `TenantMatchGuard` registered globally after auth, or in `RolesGuard`, or an interceptor. **Nuance to decide:** PLATFORM_ADMIN tokens carry `tenantId: null` (super-admin routes are already excluded from `TenantMiddleware`); impersonation tokens carry the *target* tenant's tenantId (so they'd pass naturally). Safe default: **enforce only when `token.tenantId` is non-null** (non-null must equal the resolved tenant); allow null (platform admin) through. Regression test: cross-tenant token → 403; same-tenant → 200; platform-admin/impersonation unaffected. |
| **Why not fixed inline** | Security-critical **core auth path** (every request) with a genuine platform-admin/impersonation nuance → Bug Protocol STOP-and-report. Surfaced at CHECKPOINT 10 for the architect to approve the fix approach (placement + platform-admin handling) before touching auth. |

## OBS-C (Phase 10) — student status enum in stats — **FIXED**

`getStats.byStatus` counted stale `INACTIVE`/`GRADUATED` (statuses that can never be set) and **dropped** the real `PASSED_OUT`/`EXPELLED`/`DROPPED`. Fixed to the real enum `ACTIVE/PASSED_OUT/EXPELLED/TRANSFERRED/DROPPED` (API `student.service.getStats` + web `api.types.ts` + `students/overview` page + unit test). **Live-proven:** a student set `PASSED_OUT` → `byStatus.PASSED_OUT = 1` (was invisible before). 4 files. (Note: `new_this_month` uses SQL `CURRENT_DATE` — DB-session date, separate from the OBS-E JS-toISOString family.)

## BUG-3 (Phase 5) — Money computed in JS floats — **CONFIRMED; needs remediation decision (NOT fixed inline)**

| Field | Value |
|---|---|
| **Finding** | All persisted amounts are `NUMERIC(10,2)` (storage correct), but **every derived figure is computed in JS floats** and written back via bound params (Postgres re-quantizes on write). ~25 sites (full grep list from finance recon): the two float-sensitive kinds are **percentage discount** `originalAmount * (1 - pct/100)` (`invoice.service.ts:67,512,552`) and **fine** `daysOverdue * finePerDay` (`invoice.service.ts:277`); plus subtotal/discount/total accumulation (`:80-81,86-87,142,281`), all report aggregates (`report.service.ts:57-89,148-153,230-249`), and `fee-structure.service.ts:118,149`. Root converter `entities/finance.entity.ts:211` `toNum`=`parseFloat`. Only `invoices.balance` avoids JS (SQL `GENERATED STORED`); the gateway paisa path is integer-safe by design. |
| **Impact** | The `Math.round(x*100)/100` snap corrects most float error, so observed values are usually right (live sweep: 20% of 1000 = 200.00 exact; fine 12×10 = 120.00 exact). But it is **not provably correct** — half-cent inputs and long item-accumulation can drift, and per architect decision 3 "money computed via JS floats is a bug even if stored as NUMERIC." |
| **Disposition** | **DEFERRED → MON-1** (dedicated post-QA-1 pass; architect decision). **No BUG-3 code changes in QA-1.** |
| **Agreed remediation (MON-1)** | (a) **Report aggregates** (report.service totals/rates) → **SQL-side NUMERIC aggregation** (SUM/aggregate in Postgres, not JS reduce). (b) **Transactional derived money** (discounts in `calculateItemAmounts`, fines in `recalculateFine`, **library `issue.service` `fine_amount`**) → **`Prisma.Decimal` arithmetic** — decimal.js is already bundled via Prisma, so **no new dependency**. (c) **Integer-paisa rejected** as unnecessarily invasive. (d) **Schema normalization (Phase-10 decision):** while touching money columns, normalize **`book_issues.fine_amount NUMERIC(8,2) → NUMERIC(10,2)`** (and consider `fine_per_day NUMERIC(6,2)`) for consistency with the finance money columns. |

## dueDate text-vs-date cast — **VERIFIED already fixed (no action)**

The Phase-5 backlog "dueDate cast bug" is **already resolved**: `invoice.service.ts:160` casts `$4::date`, both `fee_structure_items` writes cast `$5::date` (POL-1 T1 + sibling `updateItems`). Finance recon confirmed **zero** un-cast DATE writes (payments/transactions have no DATE column). Live: fee-structure create + invoice generate with `dueDate` → 201 (no Postgres 42804). Grep for siblings found none.

## BUG-2 (Phase 4) — Cross-teacher assignment edit records no actor — **FIXED**

| Field | Value |
|---|---|
| **Finding** | Assignment writes are soft-scoped (any teacher may edit/publish/close any assignment — cover-teacher reality). But `update`/`publish`/`close` took **no `@CurrentUser`** and the `assignments` table had **no `updated_by`** — so a teacher editing another teacher's assignment was **anonymous** (only the original `created_by` was recorded). Per architect decision 3, soft-scoped writes are intentional *only if* the actor is stamped → this is a bug, fixed by **adding the stamp** (never a block). |
| **Fix** | Migration **0009_assignments_updated_by** adds `assignments.updated_by UUID REFERENCES users(id)` (canary demo→all 7). Controller passes `@CurrentUser` to update/publish/close; service stamps `updated_by`=actor. Review already stamped `reviewed_by`. 4 files + 1 regression test. |
| **Re-verified** | Live: teacher2 edits teacher1's assignment → 200, psql `created_by`=teacher1 (unchanged), `updated_by`=teacher2; publish stamps `updated_by`; teacher2 review → `reviewed_by`=teacher2. Unit: `update` SQL includes `updated_by = $7::uuid` and passes the editor's id (not the author's). Student/parent hard-scoping unchanged (cross-section submit→403). |

## OBS-B — bs-calendar DOB off-by-one — **CONFIRMED, DEFERRED → FIX-3**

| Field | Value |
|---|---|
| **Finding** | For a student DOB of AD **2010-05-20**, the API renders BS **2067-02-07** (Jestha 7, 2067) via `adToBs`. |
| **External authority** | hamropatro's Jestha 2067 page shows **1 Jestha 2067 = 2010-05-15**, so **2010-05-20 = 2067-02-06**. The app is **+1 day** (renders 07, correct is 06). |
| **Root cause** | The `bs-calendar` `BS_MONTH_DATA` lookup table is off-by-one in this era — the **documented FIX-3 open bug** (CLAUDE.md: "2070-era table one day off; audit 2000–~2080"). Modern era (2082-83 academic year) is correct. |
| **Disposition** | **DEFERRED → FIX-3.** Do NOT modify the lookup table in QA-1 (FIX-3 is its own pass; the 2070-era `date.util.spec.ts` vectors are keyed to the current table and must change with the table fix). Affects historical BS dates platform-wide (student DOBs). |

## OBS-A follow-up — guardian soft-delete propagation — **DEFERRED → CL (post-QA-1)**

| Field | Value |
|---|---|
| **Finding** | OBS-A added `guardians.deleted_at` + filtered the 6 reads in `guardian.service.ts`. **~9 other guardian-table reads are NOT filtered:** communication listeners (attendance/notice/examination/finance/assignment), finance (report/invoice), `sms.service`, attendance `leave.service` + `student-attendance.service`, `storage/file-access`, `examination/result`, `academic/timetable`, `assignment/submission`. |
| **Severity** | **Real but low.** Soft-deleting a guardian is now **live-possible** (the column exists), so a soft-deleted guardian could still leak via these unfiltered paths (audience fan-out, scoping checks). Low because **no delete path emits a soft-delete today** — it only becomes reachable once a guardian-removal feature ships. |
| **Disposition** | **DEFERRED → CL (changelog/backlog).** Spec a "guardian soft-delete propagation" sweep after QA-1 (add `deleted_at IS NULL` to all guardian reads, ideally via a shared helper). Not done in QA-1: exceeds the Bug-Protocol ≤5-file limit and touches access-control/audience queries that warrant their own review. |

## OBS-D — Attendance permits Saturday marks — **INTENTIONAL (backlog CAL-1)**

`bulkMark` accepts attendance on Saturday (Nepal's weekly holiday) — Sat `2026-07-10` → 201. **Decision: keep the backend permissive.** Working-days are derived from actually-marked dates (self-consistent), so `%` stays correct. Proper working-day logic needs a **school-calendar/holidays module (CAL-1, backlogged)** — Dashain/Tihar/exam breaks make a holiday table necessary regardless of Saturdays, so hardcoding "reject Saturday" would be the wrong fix. No change in QA-1.

## OBS-E — UTC-today instead of Nepal-today — **FIXED (Phase 3, this branch)**

| Field | Value |
|---|---|
| **Finding** | `student-attendance.service.ts` `getSchoolSummary` computed "today" as `new Date().toISOString().split('T')[0]` = **UTC-today**, so the dashboard "today's attendance" board showed the **previous Nepal day** for the first 5h45m after Nepal midnight. |
| **Scope (grepped)** | Decision scope = attendance module + fine-cron-consumed code. Only **1** UTC-today-truncation occurrence there: `getSchoolSummary`. The fine cron's `recalculateFine` uses server-local `new Date()`+`setHours` (Nepal-correct under the TZ pin, **not** the `toISOString` bug). `invoice.service:143` is invoice-*create* (not fine-cron-consumed) → out of scope. |
| **Fix** | Added canonical `todayAdInNepal()` to shared `common/utils/date.util.ts` (offset arithmetic, `NEPAL_OFFSET_MS`, TZ-independent). `getSchoolSummary` now calls it. **3 files** (date.util + attendance service + date.util.spec). |
| **Re-verified** | Mocked-clock regression test at `2026-07-14T00:30+05:45` (= `2026-07-13T18:45Z`): old UTC path → `2026-07-13`, `todayAdInNepal()` → **`2026-07-14`** (both asserted). Live: `GET /attendance/students/school/summary` → 200, `date {ad:2026-07-13, bs:2083-03-29}` (midday, UTC==Nepal — endpoint intact). Suite 518. |
| **Re-scoped INTO QA-1 (architect decision)** | The other ~10 UTC-today `new Date().toISOString()` "today" sites are now fixed in their owning phases with `todayAdInNepal()`, each per Bug Protocol (mocked-clock test + live proof): **Phase 5** — `finance/report.service.ts:20,110` + `finance/invoice.service.ts:143` (invoice-create default due date) + migrate `invoice.service.recalculateFine` off server-local `new Date()`; **Phase 8** — `hr/staff.service.ts:302`; **Phase 9** — `library/issue.service.ts:92`; **Phase 10** — `dashboard.service.ts:28,290` (+ week loop); **Phase 11 cleanup** — `student/import.service.ts:219`. Tracked as OBS-E-2…E-6 below. |

### OBS-E follow-ups (scheduled into QA-1 phases)
| Ref | Site | Phase | Status |
|---|---|---|---|
| OBS-E (this) | `attendance/student-attendance.service.ts` getSchoolSummary | 3 | **FIXED (b8d1bf9)** |
| OBS-E-2 | `finance/report.service.ts:20,110`; `finance/invoice.service.ts:143`; **`invoice.recalculateFine` + fine-cron `recalculate-fines.job.ts:115-121` → `todayAdInNepal()`** (TZ-independent day-diff) | 5 | **FIXED (this branch)** — 4 files + 2 mocked-clock tests; live fine-execution proof 120.00 |
| OBS-E-3 | `hr/staff.service.ts:302` (soft-delete `end_date`) → `todayAdInNepal()` | 8 | **FIXED (this branch)** — 2 files + mocked-clock test (end_date=2026-07-14 at 00:30+05:45); live delete → end_date 2026-07-13 |
| OBS-E-4 | `library/issue.service.ts` returnBook (`returned_at` + overdue day-count) → `todayAdInNepal()` + TZ-independent diff | 9 | **FIXED (this branch)** — 2 files + mocked-clock test (returned_at=2026-07-14, fine_days=4 at boundary). **Live-proven off-by-one**: returned_at now 2026-07-13 (was 2026-07-12 — local-midnight→toISOString rendered the prior UTC day even at midday). Fine amount `fine_days × fine_per_day` is JS-float → BUG-3/MON-1 (not fixed). |
| OBS-E-5 | `dashboard.service.ts` getOverview (28) + getUpcoming (290) + weekly-attendance window → `todayAdInNepal()` | 10 | **FIXED (this branch)** — 2 files + 2 mocked-clock tests; live weekEnd=2026-07-13. Week is a rolling 7-day window ending Nepal-today (NOT ISO-Monday — no week-start logic; each day labeled by its own day-of-week). |
| OBS-E-6 | `student/import.service.ts:219` | 11 | pending |
| OBS-F (reclassified into OBS-E family) | `finance/payment.service.ts:28-31` (`deriveStatus`) + `invoice.service.ts:146` / `payment.service.ts:70` (`getBsYear(new Date())`) → `todayAdInNepal()` + mocked-clock tests | 11 | pending |

## OBS-G (Phase 8) — Leave self-approval is permitted — **INTENTIONAL (no guard)**

`LeaveService.reviewLeave` has no `reviewerId !== leave.user_id` check; a reviewer can approve their own leave (live-proven: owner applied then approved → 200, `reviewed_by = user_id`). **Ruling: INTENTIONAL, no guard.** Rationale: only **admin-tier roles** can review (proven by teacher2's **403**), so self-approval only arises at the **top of the hierarchy**, where the owner has no approver above them; `reviewed_by` stamps the act, making it fully **auditable** — consistent with the platform's **permissive-but-accountable** model. **Revisit:** add a `reviewer ≠ applicant` guard **for non-owner roles** if a mid-level approver role is ever introduced.

## CAL-1 note (Phase 8) — leave days are calendar days

`LeaveService.applyLeave` computes `total_days = ceil((to - from)/day) + 1` = **calendar days**, with **no Saturday/holiday exclusion** (live: a Fri→Sun leave spanning Saturday counted 3 days). Recorded for **CAL-1** (school-calendar/holidays module) — the same backlog that should drive attendance working-days (OBS-D). No judgment/fix this phase.

## OBS-C — student status enum consistency — **upgraded → verify in Phase 10**

Student *status* enum differs across surfaces — list-query `ACTIVE/PASSED_OUT/EXPELLED/TRANSFERRED/DROPPED` vs `stats.byStatus` keys `ACTIVE/INACTIVE/TRANSFERRED/GRADUATED`. **Phase 10 plan:** set one QA student to `PASSED_OUT` (via the status-update endpoint) and assert `stats.byStatus` counts it correctly against a direct psql count. If the stats buckets are hardcoded stale enums that drop `PASSED_OUT`, that is a **bug to fix in Phase 10**.
