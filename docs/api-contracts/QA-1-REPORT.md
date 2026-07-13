# QA-1 — Full-System Audit: Final Report

**Branch:** `feat/qa-1-full-system-audit` · **Date:** 2026-07-13 · **Auditor:** Claude Code (Opus 4.8)
**Scope:** every shipped module, verified with **live HTTP + psql read-back** against a purpose-built
`qa-demo` tenant (4 students / 4 distinct families, 2 teachers, 2 parents, 2 student logins).
**Method:** per the ground rules — real requests only (unit tests prove nothing on their own), raw
output captured for every check, STOP-on-ambiguity, **no SMS**, **no live gateway payments** (eSewa/Khalti
initiation-only), **no merges**.

---

## 1. Verdict

**The system is production-shippable after this branch merges.** Eleven phases were exercised end-to-end;
every functional matrix cell is **PASS**. One **CRITICAL** defect (cross-tenant data leak, BUG-4) was found
and **fixed with closing proofs**. Ten smaller defects/observations were found; **8 are fixed on this branch**,
**3 are deliberately deferred** with an agreed remediation owner (BUG-3→MON-1, OBS-B→FIX-3, OBS-A-followup→CL),
and **3 are ruled intentional** (OBS-D, OBS-G, CAL-1 day-counting) per architect decisions.

| Metric | Result |
|---|---|
| Phases completed | **11 / 11** (0–10 + Phase 11 regression/cleanup) |
| API test suite | **533 / 533 passing** (69 suites) — baseline was 511; **+22** from QA-1 fixes |
| Type safety | `api` (build config) **clean** · `web` **clean** · `mobile` **clean** |
| CRITICAL bugs | 1 found → **1 fixed** (BUG-4) |
| Bugs fixed on-branch | **8** (BUG-1, BUG-2, BUG-4, OBS-A, OBS-C, OBS-E/E-2…E-6, OBS-F) |
| Tenant migrations added | **2** (0008 guardians soft-delete, 0009 assignments updated_by) — canary demo→all 7 |
| Deferred (owner assigned) | **3** (BUG-3→MON-1, OBS-B→FIX-3, OBS-A-followup→CL) |
| Ruled intentional | **3** (OBS-D, OBS-G, CAL-1 leave day-count) |
| Live gateway calls / SMS sent | **0 / 0** (as mandated) |

---

## 2. Results matrix (per phase)

Every phase's detailed feature × role × CRUD × scoping grid is in **`QA-1-RESULTS.md`**. Summary:

| Phase | Module | Cells | Outcome |
|---|---|---|---|
| 0 | Environment + Assignment file upload | 4 | **ALL PASS** — stack up; assignment upload works E2E once MinIO runs (reported failure was MinIO-down → BUG-1, environmental + code hardening) |
| 1 | Students | 9 | **ALL PASS** — `created_by` stamp, soft-delete, photo→MinIO byte-exact, guardian casing, `/me`+`my-children` own-scope, `:id`→403 |
| 2 | Attendance | 7 | **ALL PASS** — `marked_by` stamp, AD-store/BS-display, future-date 400, cross-family 403, cron armed (Nepal-tz, not silently dead) |
| 3 | Academic | 6 | **ALL PASS** — year/class/section/subject CRUD+soft-delete, class-subject map, Sun–Fri timetable, admin-write/all-read |
| 4 | Assignments (EDU-1/2) | 10 | **ALL PASS** — full DRAFT→PUBLISHED→CLOSED + submit→review; soft-scoped teacher writes now **accountable** (`updated_by`/`reviewed_by`); student/parent hard-scoped |
| 5 | Finance | 9 | **ALL PASS** — NUMERIC money, **fine-cron EXECUTION** proven (Rs120), eSewa initiate **HMAC-verified** (0 live calls), Khalti 503 (disabled), cross-family 403 |
| 6 | Examinations | 7 | **ALL PASS** (no code change) — `entered_by` stamp, out-of-range 400 + psql no-write, marks→grade→rank pipeline, publish privacy gate, report-card JSON+PDF, cross-family 403 |
| 7 | Reports (REP-1) | 4 | **ALL PASS** (no code change) — **BS-month bucket boundary proven** (Ashadh 31 vs Shrawan 1 split), fee-aging asOf Nepal-correct, teacher/student/parent 403 |
| 8 | HR & Staff | 7 | **ALL PASS** — staff CRUD+soft-delete (`end_date` Nepal-today), leave loop with `reviewed_by`, **state-machine integrity** (reject-after-approve/double-approve→400), non-approver 403; self-approval FLAGGED→OBS-G (intentional) |
| 9 | Library | 7 | **ALL PASS** — **inventory round-trip psql-proven**, double-issue 400 / double-return 404, **OBS-E-4 off-by-one live-fixed** (returned_at now Nepal-today), staff-only issue surface |
| 10 | Dashboard & cross-cutting | 8 | **ALL PASS after BUG-4 fix** — stats vs psql, weekly window Nepal-today, theming, push upsert (0 sends), data-isolation 404, **token-isolation now 403** |

---

## 3. Bug table (root cause → fix → commit)

### Fixed on this branch

| # | Sev | Module | Defect | Root cause | Fix | Commit |
|---|---|---|---|---|---|---|
| **BUG-4** | 🔴 **CRITICAL** | Auth / multi-tenancy | A valid JWT from tenant A could **read and write any tenant B's data** by sending `X-Tenant-Slug: B`. | `TenantMiddleware` resolves the schema **solely from the header** and runs **before** auth; `JwtStrategy` just echoes the payload. **Nothing compared `token.tenantId` vs the resolved `tenant.tenantId`** — auth and tenant-context were decoupled. | Global `TenantMatchGuard` (via `APP_GUARD`, after a lenient global `OptionalJwtGuard` that populates `req.user` without ever rejecting). Compares canonical **tenant ids** (never slugs) → **403** on mismatch; `tenantId==null` (platform admin) → allow + **structured audit log**; no-user/no-tenant → no-op. 4 files + 5 regression tests. | `39c789f` |
| **BUG-1** | Med | Storage (FILE-1) | Assignment file upload surfaced an opaque "file-upload error" when MinIO was down. | Env, not logic: `StorageService` marks storage *enabled* on env-var presence with **no reachability probe**, so presign 201s and only the browser's direct PUT to :9000 fails. | `HealthService` now `HeadBucket`-probes S3 → `storage` component in `/health`; storage down → `degraded` (**HTTP 200**, only db-down → 503); startup **WARN** when unreachable. 4 files + 3 tests. | `8611d5b` |
| **BUG-2** | Low | Assignments | A teacher editing another teacher's assignment was recorded **anonymously** (only original `created_by`). | Soft-scoped writes (cover-teacher reality) are intentional, but `update`/`publish`/`close` took no `@CurrentUser` and the table had no `updated_by`. | Migration **0009** adds `assignments.updated_by`; controller passes `@CurrentUser`, service stamps actor (per decision: fix by **adding the stamp**, never a block). 4 files + 1 test. | `fb4a620` |
| **OBS-A** | Low | Students/Guardians | `guardians` had **no `deleted_at`** (inconsistent with every other main entity). | Table predated the soft-delete convention; no guardian delete path existed. | Migration **0008** adds `deleted_at` + partial index (canary demo→all 7); the 6 `guardian.service` reads filter `deleted_at IS NULL`. 3 files + 3 tests. | `8611d5b` |
| **OBS-C** | Low | Students | `stats.byStatus` counted stale `INACTIVE`/`GRADUATED` (never-set) and **dropped** real `PASSED_OUT`/`EXPELLED`/`DROPPED`. | Hardcoded stale enum, drifted from the real status enum. | API `getStats` + web types/overview page → real `ACTIVE/PASSED_OUT/EXPELLED/TRANSFERRED/DROPPED`. Live-proven (`PASSED_OUT=1`). 4 files. | `9bd7a26` |
| **OBS-E family** | Low | 8 sites | "Today" computed as `new Date().toISOString()` = **UTC-today**, wrong by 5h45m each Nepal night (dashboards/reports/invoices/fines/staff/library/import/payments showed the previous Nepal day after midnight). | UTC-frame date truncation instead of Asia/Kathmandu. | Canonical `todayAdInNepal()` (offset arithmetic, TZ-independent) added; all 8 sites migrated. Each with a mocked-clock test at `2026-07-14T00:30+05:45` + live proof. **OBS-E-4 caught a real off-by-one** (library `returned_at` was rendering the prior day even at midday). | `b8d1bf9` (E), `1b42c17` (E-2), `24ec458` (E-3), `4b2af73` (E-4), `9bd7a26` (E-5), `48eaf75` (E-6), `48eaf75` (OBS-F) |

### Deferred (confirmed, not fixed here — owner assigned)

| # | Sev | Defect | Why deferred | Owner / plan |
|---|---|---|---|---|
| **BUG-3** | Med | All **derived** money computed in **JS floats** (percentage discount, fine = days×rate, report aggregates, subtotal accumulation) before write-back. Storage is correct NUMERIC(10,2); `Math.round(x*100)/100` snaps most error, so observed values are right — but **not provably** correct at half-cent inputs / long accumulation. | Architectural, cross-cutting (~25 sites); STOP-and-report per Bug Protocol. Integer-paisa rejected as too invasive. | **MON-1**: report aggregates → **SQL-side NUMERIC** aggregation; transactional derived money (discounts, fines, **library `fine_amount`**) → **`Prisma.Decimal`** (decimal.js already bundled — no new dep). Also normalize `book_issues.fine_amount (8,2)→(10,2)`. |
| **OBS-B** | Low | Historical BS dates render **+1 day** in the 2067 era (e.g. DOB `2010-05-20` → `2067-02-07`; hamropatro authority = `2067-02-06`). Modern era (2082-83) is correct. | The `bs-calendar` `BS_MONTH_DATA` table off-by-one is the **already-documented FIX-3 bug**; its own pass (the 2070-era `date.util.spec` vectors are keyed to the current table and must change with the table fix). | **FIX-3**: audit the table 2000–~2080 against authoritative anchors. Affects student DOB display platform-wide. |
| **OBS-A followup** | Low | ~9 **cross-module** guardian reads (comm listeners, finance report/invoice, sms, attendance leave/scoping, storage file-access, exam result, timetable, submission) don't yet filter `deleted_at`. | Harmless today (no delete path emits a soft-delete), but becomes reachable once a guardian-removal feature ships. Exceeds the ≤5-file Bug-Protocol limit and touches access-control/audience queries. | **CL** (backlog): a "guardian soft-delete propagation" sweep, ideally via a shared `deleted_at IS NULL` helper. |

### Ruled intentional (no fix — architect decision)

| # | Finding | Ruling |
|---|---|---|
| **OBS-D** | `bulkMark` accepts attendance on **Saturday** (Nepal's weekly holiday). | **Keep backend permissive.** Working-days derive from actually-marked dates (self-consistent → % stays correct). Proper holiday logic needs the **CAL-1** school-calendar module (Dashain/Tihar/exam breaks make a holiday table necessary regardless of Saturdays). |
| **OBS-G** | Leave **self-approval** is permitted (owner applies then approves → 200). | **Intentional, no guard.** Only admin-tier roles can review (teacher2 → 403), so self-approval only arises at the **top of the hierarchy** where there's no approver above; `reviewed_by` stamps the act → auditable. Revisit only if a mid-level approver role is introduced. |
| **CAL-1 note** | Leave `total_days` counts **calendar days** (Fri→Sun over a Saturday = 3). | Recorded for **CAL-1**; no judgment/fix (same backlog as OBS-D). |

---

## 4. Open questions for the architect

1. **MON-1 scheduling** — the JS-float money remediation (BUG-3) is confirmed and scoped but untouched. When should it run? It is the only *Medium*-severity item left open.
2. **FIX-3 (BS table)** — historical BS dates (student DOBs) are +1 day pre-~2080. Modern operational data is correct, so this is not blocking, but student profiles show wrong BS birthdays. Prioritise before any historical-date reporting feature.
3. **CAL-1 (school calendar / holidays)** — three findings (OBS-D attendance Saturdays, CAL-1 leave day-count, and eventual working-days accuracy) all wait on this module. Confirm it's on the roadmap.
4. **Base64 → S3 migration** — Phase 10 census found **4 legacy base64 blobs** still in DB (jorden-donovan + motherland logos; motherland student & staff photos). FILE-1 handles new uploads; migrating the 4 legacy blobs + shrinking the JSON body-limit is a separate follow-up (per the FILE-1 runbook).
5. **CLASS-audience notice visibility** (pre-existing, PUSH-1 backlog) — `GET /notices` doesn't return CLASS-audience notices to STUDENT/PARENT even though push now notifies them. Not in QA-1 scope; flagged for closure.

---

## 5. Cleanup (Phase 11) — done & proven

- **DB:** `DROP SCHEMA tenant_qa_demo CASCADE` (50 objects) + `DELETE` public `subscriptions` (1) + `tenants` (1). Post-proof: schema/tenant/subscription counts **all 0**.
- **Object storage:** `mc rm --recursive tenant_qa-demo/` — 7 objects removed, prefix **empty**; `tenant_demo` unaffected.
- **Spared (proven):** `pay1-verify@demo.school` (ACCOUNTANT, tenant `demo`, PAY-1 gate) — schema `tenant_demo` intact, account present.
- Seed registry `QA-1-SEED.md` carries a **TORN DOWN** tombstone; all IDs there are now dead.

---

## 6. Manual on-device checklist for Srijan (UI-only flows the audit could not click)

The audit proved every **API + data** path with live HTTP + psql. What a headless auditor **cannot** verify is
the actual **rendering, tap-routing, and native pickers** on a physical phone / browser. These are the residual
manual checks — each is written as a baby-step so you can do them without thinking about internals. Do them on the
**preview APK** (EAS-1) pointed at your dev API, plus the web admin portal.

> Suggested test school: use a real seeded tenant (e.g. `demo`) — the `qa-demo` tenant was torn down.

### A. Web admin portal (desktop browser)
1. Log in as a **school owner**. → Dashboard renders with stat cards, weekly-attendance chart, activity feed (no blank/spinner-stuck panels).
2. **Students → overview** → confirm the status cards read **"Passed Out"** (not "Graduated") and the numbers match the list.
3. **Finance → Defaulters** → the list renders and **"Export CSV"** downloads a file that opens in Excel with BS dates.
4. **Reports** → switch all three tabs (Attendance / Exams / Fees); each renders a chart; each "Export CSV" downloads.
5. **Exams → Grading scales** → create a scale, then **rename** it (thresholds are intentionally read-only after create).
6. Kill your dev API for 5 seconds while on the Students page → confirm you see a **"Try again"** error card (not a white screen), then bring the API back and click Try again.
7. **Settings → Change password** → change it, get logged out, log back in with the new password.

### B. Mobile — first-run & auth (preview APK)
8. Fresh install → **school-code screen** → type the school code → school name appears → login screen shows that school's name.
9. Log in as a **parent**. Toggle the **language** to **नेपाली** on the login screen first and confirm the UI text switches; toggle back to English.
10. If the account was created with a temp password, confirm you're routed to **Change password** and can't skip it except via "Sign out instead".

### C. Mobile — parent (the highest-traffic role)
11. **Dashboard** → your child's name shows correctly (the real guardian name, not an email-derived guess); attendance summary card renders with the % ring.
12. **Notifications bell** (top-right) → shows a live unread count; open the inbox → mark-all-read drops the count to 0.
13. **Attendance** → the BS-month calendar renders; Saturday column is tinted; today's cell is highlighted; tap month-nav across a year boundary.
14. **Fees** → open an invoice → tap **"Pay with eSewa"** → confirm the **system browser opens the eSewa page** (do **not** complete a real payment). Close it; the app should refetch on refocus. *(This is the one flow the audit deliberately never completed — needs your eyes on the real redirect.)*
15. **Results** → open a published report card → tap **Download PDF** → the PDF opens in the device viewer.
16. **Assignments** → open one with a teacher attachment → tap the attachment (opens); if open, pick a file with the **document picker**, submit, and confirm it flips to **Submitted**.

### D. Mobile — student
17. **Dashboard** → BS date in the header renders in Nepali when locale=np (month name like "असार"); timetable shows today's periods (or the Saturday "holiday" note on a Saturday).
18. **Attendance** → same BS-month calendar as the parent; your own record only.
19. **Assignments** → submit a homework file (document picker → Submitted), then confirm you **cannot** resubmit after the teacher reviews it (you should see a "Submission locked" note, not an error).

### E. Mobile — teacher
20. **Timetable** → your own periods across Sun–Fri.
21. **Attendance** → mark a section's attendance; confirm it saves and the summary updates.
22. **Assignments** → open one → review a student's submission (enter marks + feedback) → confirm the student then sees the marks and gets a notification.
23. **Notifications** → the bell routes to the **inbox** (not your profile), and tapping a push opens the right screen.

### F. Push (needs two devices or a backgrounded app)
24. Background the parent app. From the web admin, **mark that child absent** (or post a **notice** to PARENTS). → the phone should **buzz/sound** a push within ~30s. *(Note: pushes are silent while the app is in the foreground by design — background/close it to hear the sound.)*
25. Tap the push → it should open the matching screen (absence → Attendance; notice → Notices).

**If anything in this list misbehaves,** capture the screen + the API log line (each request logs a `reqId`) and file it — the backend/data layer is proven, so a failure here is almost certainly a rendering/routing/native-permission issue, not a data bug.

---

## 7. Ground-rule compliance

| Rule | Compliance |
|---|---|
| Live HTTP + psql read-back for every write | ✅ every feature; raw output captured in phase logs |
| Raw output required | ✅ per-phase in `QA-1-RESULTS.md` / `QA-1-BUGS.md` |
| STOP on ambiguous product decisions | ✅ BUG-3, BUG-4, OBS-D, OBS-G all surfaced to architect before action |
| No GitHub actions beyond `git push`; never merge | ✅ branch pushed; **no merge** |
| Skip SMS entirely | ✅ **0 SMS sent** (MOCK throughout) |
| eSewa/Khalti initiation-only | ✅ eSewa HMAC-verified INITIATED row, **0 live gateway calls**; Khalti 503 (disabled) |
| Don't build missing modules | ✅ CAL-1 / inventory left unbuilt, only flagged |
| Nepal conventions as test criteria | ✅ Asia/Kathmandu, BS-display/AD-store, Sun–Fri week, NUMERIC money, soft-deletes all asserted |
| Commit + full suite + tsc + matrix + STOP at each checkpoint | ✅ 11 checkpoints; final suite **533/533**, tsc clean ×3 |

---

*End of QA-1. Branch `feat/qa-1-full-system-audit` is ready for architect review. No merge performed.*
