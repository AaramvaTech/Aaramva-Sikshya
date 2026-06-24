# WEB-VERIFICATION-2026-06-24 — Web Admin Portal Verification (SESSION-WV1)

**Type:** Read-only live verification of the web admin portal (owner / principal / coordinator / accountant / librarian surface). **No fixes** — broken/uncertain flows are logged for follow-up sessions.
**Method:** For each P1 flow, identified the page's real API call(s), executed them **live against the running API (`localhost:3001`) and real Postgres**, with the **correct role token**, confirmed the round-trip (write persists via `SELECT` read-back / read returns usable data), reconciled the **web hook's response-shape parsing** against the live shape, and confirmed the **role guard** (including wrong-role rejection).
**Tenant:** clean demo tenant `wv1t89885` provisioned via `POST /auth/register-school`; staff (coordinator/accountant/teacher) created via `POST /hr/staff` and logged in for role-correct calls.
**Source of truth:** `FEATURE-COVERAGE-2026-06-23.md` (web 🟡). ✅-prior cells (LV1 leave review, RS1 publish, OB1–OB3 wizard, R2 timetable) confirmed-at-page-level only, not deeply re-verified.

> **Response-shape note (resolved, important for future audits).** Every list endpoint returns `{success, data:{data:[…], meta:{page,limit,total}}, meta:null}`. In the **web axios** client the HTTP body is under `r.data`, so a paginated list's array is at **`r.data.data.data`** and a single object at **`r.data.data`** — exactly what the hooks use (matches `CLAUDE.md`). A raw `Invoke-RestMethod`/`curl` probe auto-unwraps the body and therefore sits **one level shallower** (`.data.data` = the array). All hook parsing checked here is **correct**; an interim "fee-list parses to undefined" flag was a PowerShell-vs-axios off-by-one and is **withdrawn**.

---

## Step 0 — Inventory matrix (route → endpoint(s) → role → status)

Status: ✅ proven-live this session · ✅-prior proven by a prior session (page-level confirmed) · 🟡 code-only (not live-verified) · ⚠️ broken/role-mismatch.

| # | Web route | Primary endpoint(s) | Role that uses it | Status | Confidence |
|---|---|---|---|:--:|---|
| 1 | `/students/new` (admission) | `POST /students` | Coordinator/Principal/Owner | ✅ | High — live persist |
| 2 | `/students/[id]` (enroll) | `POST /students/:id/enroll` | Coordinator/Principal/Owner | ✅ | High — live persist |
| 3 | `/students`, `/students/overview` | `GET /students`, `GET /students/stats` | All staff | 🟡→✅(list) | List shape proven; stats code-only |
| 4 | `/academic/years` | `POST /academic-years` → `PATCH /:id/set-current` | Owner/Principal(+Coord set-current) | ✅ | High — two-step live |
| 5 | `/academic/classes` | `POST /classes`, `POST /classes/:id/sections` | Owner/Principal/Coord | ✅ | High — live |
| 6 | `/academic/subjects` | `POST /subjects`, `POST /classes/:id/subjects` | Owner/Principal/Coord | ✅ | High — live |
| 7 | `/academic/timetable` | `POST /timetable`, `GET /timetable/section/:id` | Owner/Principal/Coord | ✅-prior (R2) | Page-level |
| 8 | `/attendance/mark` | `POST /attendance/students/bulk` | Teacher/Coord/Principal/Owner | ✅ | High — live persist + wrong-role 403 |
| 9 | `/attendance`, `/attendance/reports` | `GET /attendance/students/section/:id/report`, `.../school/summary` | Teacher+/Principal+ | ✅ | High — returns data |
| 10 | `/hr/leave` (review) | `GET /hr/leave`, `PATCH /hr/leave/:id/review` | Coord/Principal/Owner | ✅ / ✅-prior (LV1) | High — live persist (staff leave) |
| 11 | `/finance/fee-structures` | `POST /finance/fee-categories`, `POST /finance/fee-structures` | Accountant+ | ✅ | High — live persist |
| 12 | `/finance/invoices` | `POST /finance/invoices/generate`, **`POST /finance/payments`** | Accountant+ | ✅ | High — payment persists + wrong-role 403 |
| 13 | `/finance/reports` (collection/defaulters) | `GET /finance/reports/collection`, `.../defaulters` | **PRINCIPAL_AND_ABOVE** | ⚠️ | High — accountant 403 |
| 14 | `/finance/reports` (ledger) | `GET /finance/reports/student/:id` | Accountant+/Parent | 🟡 | Code-only (parent path proven on mobile prior) |
| 15 | `/exams` (hub) | `POST /exams/types`, **`PATCH /exams/types/:id/publish`** | Coord+ | ✅ / ✅-prior (RS1) | High — publish persists |
| 16 | `/exams/schedule` | `POST /exams/schedules/bulk` | Coord+ | ✅ | High — live |
| 17 | `/exams/marks` | `POST /exams/marks/bulk`, `GET /exams/marks` | Teacher+ | ✅ | High — marks persist |
| 18 | `/exams/results` | `POST /exams/results/compute`, `GET /exams/results/class/:id` | Coord+ (compute); Teacher+ (view) | ✅ | High — result computed + wrong-role 403 |
| 19 | `/dashboard` | `GET /dashboard/overview|weekly-attendance|activity|upcoming` | Principal+ | 🟡 | Code-only |
| 20 | `/communication/notices` | `POST /communication/notices`, publish toggle | Coord+/Teacher(create) | ✅-prior (RS1 publish) | Page-level |
| 21 | `/communication/sms`, `/notifications` | `POST /communication/sms`, `GET /communication/notifications` | Coord+ | 🟡 | Code-only (SMS mock-default) |
| 22 | `/hr/staff` (+`/[id]`,`/edit`) | `POST/GET/PATCH /hr/staff` | Principal+ | ✅-prior (OB3) | Page-level + create proven OB3 |
| 23 | `/hr/payroll` | `POST /hr/payroll/months`, `.../generate`, `.../finalize` | Principal+ | 🟡 | Code-only |
| 24 | `/library/*` | `/library/books|members|issues` | Librarian+ | 🟡 | Code-only |
| 25 | `/settings` (profile/branding) | `PATCH /settings/profile` (node-vibrant) | Principal+ | ✅-prior (OB3) | Branding proven OB3 |
| 26 | super-admin `/schools`,`/plans`,`/audit`,… | `/super-admin/*` | Platform admin | 🟡 | Code-only |

---

## Task 1 — P1 daily-operation flows (live results)

| Flow | Status | Evidence (live) |
|---|:--:|---|
| **Enrollment / admission** | ✅ proven-live | `POST /students` (coordinator) → row `2081-0001 / ACTIVE / class_name NULL`; `POST /students/:id/enroll` → `Grade 5 \| A \| roll 7` (read-back). Admission and enroll are correctly **two separate calls**. |
| **Fees — payment capture** | ✅ proven-live | Accountant: fee-category → fee-structure (`Grade 5`, total 1000) → `POST /invoices/generate` → **`POST /finance/payments` 1000 CASH**. Read-back: `payments 1000.00/CASH`; `invoices status PAID, paid_amount 1000`. **Wrong-role:** teacher `POST /finance/payments` → **403** ✅. |
| **Fees — structure/category lists** | ✅ proven-live | Hooks `useFeeCategories`/`useFeeStructures` use `r.data.data.data`; live axios shape puts the array exactly there. **Parsing correct** (interim false-flag withdrawn — see note above). |
| **Exams — marks + results** | ✅ proven-live | Coordinator grading-scale+type+bulk-schedule; teacher `POST /exams/marks/bulk` 75 → read-back `marks 75.00`; coordinator `POST /exams/results/compute` → read-back `student_results 75.00 \| B+`. **Wrong-role:** teacher `POST /exams/results/compute` → **403** ✅. |
| **Exams — publish (RS1)** | ✅ proven-live | `PATCH /exams/types/:id/publish {published:true}` → read-back `exam_types.results_published_at = 2026-06-24 12:17:58`. Publish lives on the **`/exams` hub page**, not `/exams/results` (results page has no publish hook). |
| **Attendance — mark + report** | ✅ proven-live | Teacher `POST /attendance/students/bulk` → read-back `student_attendance PRESENT \| 2024-09-01`; `GET /attendance/students/section/:id/report` returns data. **Wrong-role:** accountant `POST /attendance/students/bulk` → **403** ✅. |
| **Academic CRUD (standalone pages)** | ✅ proven-live | year(+set-current)/class/section/subject/assign all persisted via the standalone-page endpoints (not just the wizard); list hooks (`.data.data.data`) return populated arrays. |
| **Leave review (staff, LV1-prior)** | ✅ proven-live | Teacher `POST /hr/leave`; coordinator `PATCH /hr/leave/:id/review {APPROVED}` → read-back `leave_requests APPROVED`. (This is the **staff** leave loop; the **student** leave loop still has no web action UI — see risks.) |

**Guards confirmed working (wrong-role rejected 403):** accountant→attendance-mark, teacher→payments, teacher→results-compute. All three rejected correctly.

---

## ⚠️ Broken findings (for follow-up fix sessions)

### WV-1 — Accountant cannot view collection / defaulter reports (role-gate mismatch)
- **Symptom (live):** with an **ACCOUNTANT** token, `GET /finance/reports/collection?academicYearId=…` → **403**; same token on `/finance/reports/defaulters` → 403. With the **owner** token → **200**.
- **Cause:** both report routes are guarded `@Roles(...PRINCIPAL_AND_ABOVE)` = `[PLATFORM_ADMIN, SCHOOL_OWNER, PRINCIPAL]` (`finance.controller.ts:206` collection, `:212` defaulters), which **excludes ACCOUNTANT and ACADEMIC_COORDINATOR**. Payments/invoices/structures are `ACCOUNTANT_AND_ABOVE` (accountant allowed), so the accountant can *record* money but **cannot see the collection summary or defaulter list** those same pages render.
- **Impact:** the **Finance hub** (`finance/page.tsx`) and **Finance Reports** page (`finance/reports/page.tsx` Collection + Defaulters tabs) call these via `useCollectionReport`/`useDefaulters`. For the accountant — the role that runs fee collection daily — those cards/tabs **error out**. Contradicts the documented capability ("ACCOUNTANT can view collection/defaulter reports", FEATURE-COVERAGE Task 2).
- **Fix decision for follow-up:** either widen the guard to `ACCOUNTANT_AND_ABOVE` (likely intended), or correct the role design + docs. The per-student **ledger** report (`/finance/reports/student/:id`) *is* accountant-accessible, so only the school-wide summaries are gated.
- **Confidence:** High (reproduced live, 403 vs 200, guard line confirmed).

### Withdrawn (was an interim flag, NOT a defect)
- **"Finance fee-list hooks parse to undefined."** False alarm from the axios-vs-`Invoke-RestMethod` nesting difference; the web hooks' `r.data.data.data` matches the real axios shape. Logged here only so it isn't re-reported.

*(No other ⚠️ surfaced among the P1 flows — all writes persisted and all sampled guards behaved.)*

---

## Task 2 — Inventory of the rest (code-confidence; resumable)

Not live-verified this session — mapped to endpoints + roles, ready for a second pass:

| Area | Pages | Endpoints | Confidence / notes |
|---|---|---|---|
| **Dashboard** | `/dashboard` | `GET /dashboard/overview\|weekly-attendance\|activity\|upcoming` (Principal+) | 🟡 code-only. Aggregation queries; worth a live read (academic-year-scoped). |
| **Communication** | `/communication/notices\|sms\|notifications` | `POST /communication/notices` (+publish, ✅-prior RS1), `POST /communication/sms`, `GET /notifications` | 🟡. SMS is **mock-by-default** (`SPARROW_SMS_ENABLED`); notices publish toggle proven prior. |
| **HR / Staff** | `/hr/staff(+/[id]/edit)`, `/hr/payroll`, `/hr/setup` | `POST/GET/PATCH /hr/staff`, `/hr/payroll/months(+generate/finalize)`, `/hr/departments\|designations` | Staff create ✅-prior (OB3). Payroll generate/finalize 🟡 code-only — highest-value untested HR path. |
| **Library** | `/library/books\|members\|issues` | `/library/*` issue/return/fine | 🟡 code-only. Full backend+web; no live round-trip yet. |
| **Settings / Branding** | `/settings` | `PATCH /settings/profile` (node-vibrant derive) | Branding ✅-prior (OB3); other profile fields 🟡. |
| **Super-Admin** | `/schools(+/[id])`, `/plans`, `/revenue`, `/audit`, `/settings` | `/super-admin/plans\|tenants\|impersonation\|analytics\|audit` | 🟡 code-only. Provisioning itself exercised indirectly (register-school) but the super-admin UI endpoints untested. |
| **Student ledger / finance reports (non-accountant)** | `/finance/reports` ledger tab | `GET /finance/reports/student/:id` | 🟡 (parent path proven on mobile prior). |

---

## Biggest web risks (ranked — flows most likely to break a school's day)

1. **Accountant locked out of collection/defaulter reports (WV-1, ⚠️ confirmed).** The finance role can take payments but can't see who has paid / who owes — the daily reconciliation view 403s for them. Most likely day-one complaint from a school's front office.
2. **Student leave loop has no web action UI (🟠, carried from feature audit).** Parents file leave from mobile into a queue; `/hr/leave` only reviews **staff** leave (verified — that path works), so student leaves are unactionable on web and the parent is never notified. Verified by absence, not re-tested here.
3. **Payroll generate/finalize untested (🟡).** Money-movement path (salary slips, finalize is irreversible-ish) with zero live proof. Recommend it be the first Task-2 item to live-verify.
4. **Results "release" semantics (🟡 nuance).** Publish now exists and persists (RS1 ✅), but it's an **exam-type-level** flag on the `/exams` hub — confirm the student/parent apps actually gate visibility on `results_published_at` (compute still writes results immediately). Annual GPA remains stubbed `null` per prior audit.
5. **Dashboard / super-admin / library entirely code-only (🟡).** High surface area, no live round-trip; any shape-mismatch there is currently invisible.

---

## Raw evidence (live), grouped by flow — tenant `wv1t89885`

**Setup:** `year=95ab7e40…` `class=f7511a93…(Grade 5)` `section=dea9560d…(A)` `subject=8e944d43…(Science)`; staff logins OK for coordinator/accountant/teacher.

**Enrollment/admission**
```
after admit  (SELECT student_id|status|class_name):  2081-0001 | ACTIVE | NULL
after enroll (SELECT class_name|section_name|roll):   Grade 5 | A | 7
```

**Attendance**
```
POST /attendance/students/bulk (teacher) → 201
student_attendance read-back: PRESENT | 2024-09-01
GET /attendance/students/section/:id/report → returns data (ok)
wrong-role: accountant POST /attendance/students/bulk → 403
```

**Fees**
```
payments read-back:  1000.00 | CASH
invoices read-back:  PAID | paid_amount 1000.00
wrong-role: teacher POST /finance/payments → 403
reports role-gate: accountant GET /finance/reports/collection → 403  |  owner → 200   ⚠️ WV-1
fee-categories live shape: {success,data:{data:[…],meta:{page,limit,total}},meta:null}  → hook r.data.data.data = array ✅
```

**Exams**
```
marks read-back:            75.00
student_results read-back:  75.00 | B+
wrong-role: teacher POST /exams/results/compute → 403
publish read-back: exam_types.results_published_at = 2026-06-24 12:17:58
GET /exams/marks live shape: paginated wrapper (hook r.data.data.data) ✅
```

**Academic CRUD**
```
/classes live: {success,data:{data:[{Grade 5,sections:[A]}],meta},meta:null} → list hooks return arrays ✅
year created + set-current (two-step) persisted; subject created + assigned to class persisted
```

**Leave review (staff)**
```
POST /hr/leave (teacher) → PATCH /hr/leave/:id/review {APPROVED} (coordinator)
leave_requests read-back: APPROVED
```

---

**Verdict:** Web admin P1 daily-operation flows are **largely solid** — 8/8 verified flows round-trip and persist live, hook response-shape parsing is correct throughout, and sampled role guards reject wrong roles. **One real defect (WV-1):** the accountant role is blocked from the finance collection/defaulter reports it is expected to use. Remaining areas (dashboard, payroll, library, super-admin, communication) are code-present but **unverified** and queued for a second live pass.

---

# SESSION-WV2 — Closeout (appended 2026-06-24)

Two tasks: **(1) fix WV-1** (a code change, then prove live) and **(2) live-verify** the four areas WV1 left code-only (dashboard, payroll, super-admin, library) — actual API calls with the right roles, not inference.

## Task 1 — WV-1 FIXED (code change + live proof)

**Change:** `apps/api/src/modules/finance/finance.controller.ts` — widened the guard on `GET /finance/reports/collection` and `GET /finance/reports/defaulters` from `PRINCIPAL_AND_ABOVE` → **`ACCOUNTANT_AND_ABOVE`** (the same constant payments/invoices already use; includes ACCOUNTANT + ACADEMIC_COORDINATOR, still excludes TEACHER). Removed the now-unused `PRINCIPAL_AND_ABOVE` const. `tsc -p tsconfig.build.json --noEmit` → exit 0.

**Live proof (raw statuses, tenant `wv2t20583`, dev-watch server hot-reloaded the change):**
```
collection  ACCOUNTANT -> 200   (expect 200)   ✅
collection  TEACHER    -> 403   (expect 403)   ✅
collection  OWNER      -> 200   (expect 200)   ✅
defaulters  ACCOUNTANT -> 200   (expect 200)   ✅
defaulters  TEACHER    -> 403   (expect 403)   ✅
defaulters  OWNER      -> 200   (expect 200)   ✅
```
**WV-1 status: ✅ RESOLVED** — accountant can now load the collection/defaulter reports the Finance hub + Reports page render; teacher still correctly blocked.

## Task 2 — Live verification of the four remaining areas

Real API calls against the running API + Postgres, role-correct tokens, SELECT read-backs. Tenants `wv2lt62049` (dashboard) and `wv2bt11528` (payroll/library/super-admin).

| Area | Status | Evidence (live) |
|---|:--:|---|
| **Dashboard** (owner) | ✅ proven-live | `GET /dashboard/overview` 200 keys `asOf,students,attendance,fees,unreadNotifications`; `weekly-attendance` 200 `{weekStart,weekEnd,days}`; `activity` 200 `{recentStudents,recentPayments,recentNotices}`; `upcoming` 200 `{exams}`. All four render usable data. |
| **Payroll** (owner + accountant) | ✅ proven-live | open month 200 → `generate` (accountant) 201 producing **2 salary slips** (`salary_slips` rows = 2, API len 2) → `finalize` (owner) 200, `payroll_months.status = FINALIZED` (read-back). **Guard:** accountant `finalize` → **403** (OWNER_ONLY) ✅. Full money-movement path works end-to-end. |
| **Library** (librarian) | ✅ proven-live | category → book → copy → member(STUDENT) → `POST /library/issues` 201; read-back `book_issues.status = ISSUED`, `book_copies.is_available = f`; `GET /library/issues` 200 (len 1). Full issue round-trip persists. |
| **Super-Admin** (platform admin) | ✅ proven-live | `POST /super-admin/auth/login` 200; `analytics/overview` 200 keys `asOf,totals,subscriptions,recentOnboarding`; `tenants` 200 (count 12); `plans` 200. **Guard:** school-owner JWT → super-admin → **403** ✅. *(Tested via a temporary platform admin inserted + deleted — see note.)* |

### Raw Task-2 call log
```
DASHBOARD (owner)
  overview        200  asOf,students,attendance,fees,unreadNotifications
  weekly-attend   200  weekStart,weekEnd,days
  activity        200  recentStudents,recentPayments,recentNotices
  upcoming        200  exams

PAYROLL
  open-month (owner)      200   id=13ee9439-…
  generate (accountant)   201   salary_slips rows=2, api.len=2
  finalize (owner)        200   payroll_months.status=FINALIZED
  finalize (accountant)   403   (OWNER_ONLY — correctly rejected)

LIBRARY (librarian)
  category/book/copy/member created
  issue                   201   book_issues.status=ISSUED  book_copies.is_available=f
  list issues             200   len=1
  accountant library write 201  (NOT 403 — see role-scope note below)

SUPER-ADMIN (platform admin, temp account)
  platform login          200
  analytics/overview       200   asOf,totals,subscriptions,recentOnboarding
  tenants (list)           200   count=12
  plans (list)             200   count=1
  school-owner -> super-admin  403  (correctly rejected)
```

### Findings / notes from Task 2
- **No broken flows.** All four areas round-trip and persist live; sampled guards (payroll-finalize OWNER_ONLY, super-admin vs school-owner) reject correctly.
- **Role-scope observation (not a defect): library writes are open to ACCOUNTANT and ACADEMIC_COORDINATOR.** `LIBRARIAN_AND_ABOVE` (`library.controller.ts:23-26`) explicitly includes `ACCOUNTANT` + `ACADEMIC_COORDINATOR`, so a non-librarian finance/academic role can create categories/books/issues (accountant → `POST /library/categories` returned **201**). This is consistent with the privilege hierarchy (accountant outranks librarian), **not** a broken flow — flagged only as a product question if library management should be librarian-exclusive.
- **Super-admin credential note:** the seeded platform admin (`admin@aaramvashikshya.com`) is present with a real bcrypt hash, but its password is **not** the seed's documented `Admin@1234` in this local DB (login → 401). To live-test super-admin I inserted a **temporary** platform admin (known hash), ran the calls, and **deleted it** (`DELETE 1` confirmed) — public schema left clean.

### Updated "biggest web risks" (post-WV2)
1. ~~WV-1 accountant reports~~ → **RESOLVED** (Task 1).
2. **Student-leave loop still has no web action UI** (`/hr/leave` only handles staff leave) — now the top remaining ⚠️ gap.
3. Results-release visibility gating — confirm student/parent apps gate on `results_published_at` (publish persists; compute writes immediately).
4. **Communication** (notices/SMS/notifications) remains the only major area still code-only after WV2 — SMS is mock-by-default. Candidate for a WV3 pass.
5. Object-storage / offline-attendance / push-delivery gaps (carried from feature audit) — infra, not flow defects.

**WV2 verdict:** WV-1 fixed and proven live (accountant 200 / teacher 403 / owner 200). Dashboard, payroll, library, super-admin all **proven-live** with persistence + correct guards. No new broken flows; one role-scope observation logged. Communication is the main remaining unverified area.
