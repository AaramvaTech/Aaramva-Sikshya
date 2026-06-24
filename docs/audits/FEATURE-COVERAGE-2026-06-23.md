# Feature-Coverage Audit — Aaramva Shikshya

**Date:** 2026-06-23
**Type:** Read-only product feature-completeness audit (no code changes)
**Source:** Direct codebase inventory (`apps/api`, `apps/web`, `apps/mobile`, `packages/`) — enumerated from actual controllers, route files, and screens, not a remembered module list.
**Method:** Code inspection across all three stacks + targeted spot-checks on contested items (GPA stub, PDF mechanism, object storage). Per the session brief, the three mobile role apps' read+write surfaces were proven live in prior sessions (PA / R1 / M3–M7.1) and are treated as ✅; discovery effort focused on **web**, **cross-stack wiring**, and **half-built workflows**.

**Status legend**
- ✅ **end-to-end & proven** — works through the stack; proven live in a prior session
- 🟡 **present but unverified** — code exists across the stack but not proven working live
- 🟠 **partial** — backend-only with no UI, a UI stub with no data, or a workflow that starts but can't complete
- ❌ **missing** for that surface/role
- — **not applicable** to that role/surface

---

## Step 0 — Inventory

### Roles (confirmed: 9)
From the RBAC enum + `@Roles()` guards (privilege order): `PLATFORM_ADMIN` → `SCHOOL_OWNER` → `PRINCIPAL` → `ACADEMIC_COORDINATOR` → `ACCOUNTANT` → `LIBRARIAN` → `TEACHER` → `STUDENT` → `PARENT`. The session brief's list ("student, parent, teacher, accountant, principal, school owner, platform admin") is a subset — it omits **academic coordinator** and **librarian**, both of which are real, guarded roles in the backend. There is **no dedicated mobile or web UI** for accountant, librarian, or academic coordinator beyond shared school-portal pages gated by role.

### Backend modules (NestJS, `apps/api/src/modules/`, global prefix `/api/v1`)
17 controllers, ~198 routes. Modules: **auth**, **tenant** (public slug verify), **academic** (years/classes/sections/subjects/timetable), **attendance** (student + staff + leave), **examination** (grading/types/schedules/marks/results/report-card), **finance** (fee categories/structures/assignments/invoices/payments/reports), **hr** (departments/designations/staff/leave/payroll), **library** (categories/books/copies/members/issues), **communication** (notices/SMS/notifications/device-tokens), **dashboard**, **student** (CRUD + self-service `/me` + guardian/account linkage), **settings** (profile/branding), **super-admin** (plans/tenants/impersonation/analytics/audit/settings), **branding** (service only, exposed via settings), **common** (guards/decorators/interceptors).

### Web routes (Next.js App Router, `apps/web/app/`, ~48 pages)
- **(auth):** `/login`, `/super-admin/login`
- **(school):** `/dashboard`; `/academic` (+`/classes`,`/subjects`,`/timetable`,`/years`); `/attendance` (hub), `/attendance/mark`, `/attendance/reports`; `/exams` (+`/marks`,`/results`,`/schedule`); `/finance` (hub), `/finance/invoices`, `/finance/fee-structures`, `/finance/reports`; `/hr` (hub), `/hr/staff` (+`/[id]`,`/[id]/edit`), `/hr/leave`, `/hr/payroll`, `/hr/setup`; `/library` (hub), `/library/books`, `/library/issues`, `/library/members`; `/communication` (hub stub), `/communication/notices`, `/communication/notifications`, `/communication/sms`; `/students` (+`/new`,`/[id]`,`/[id]/edit`,`/overview`); `/settings`
- **super-admin:** `/dashboard`, `/schools` (+`/[id]`), `/plans`, `/revenue`, `/audit`, `/settings`

### Mobile screens (Expo Router, `apps/mobile/app/`)
- **Pre-login (shared):** `index.tsx` (school-code entry), `login.tsx`, `help-code.tsx`, `web-portal.tsx`
- **(student):** Home (`index`), Attendance, Timetable (Routine), Notices, Profile, Results *(hidden, deep-linked)*
- **(parent):** Home, Attendance, Results, Notices, Profile, Fees *(hidden)*, Timetable *(hidden)*, Request-Leave *(hidden)*
- **(teacher):** Home, Timetable (Routine), Attendance *(write)*, Marks *(write)*, Profile, My-Attendance *(hidden)*, Leave *(hidden, write)*
- **No mobile UI** for admin/coordinator/accountant/librarian roles (`web-portal.tsx` redirects them to the web app).

---

## Task 1 — Module coverage matrix

Columns: **Backend · Web · Mobile-Student · Mobile-Parent · Mobile-Teacher**

| Module | Feature | Backend | Web | Student | Parent | Teacher |
|---|---|:--:|:--:|:--:|:--:|:--:|
| **Auth** | Login / refresh / logout / me | ✅ | 🟡 | ✅ | ✅ | ✅ |
| | Register school (self-serve) | 🟡 | ❌ | — | — | — |
| **Tenant** | Public slug verify (school-code) | ✅ | — | ✅ | ✅ | ✅ |
| **Academic** | Academic years (CRUD + set-current) | 🟡 | 🟡 | — | — | — |
| | Classes / sections | 🟡 | 🟡 | — | — | — |
| | Subjects + class-subject assign | 🟡 | 🟡 | — | — | — |
| | Timetable build (bulk per section) | 🟡 | 🟡 | — | — | — |
| | Timetable view | 🟡 | 🟡 | ✅ | ✅ | ✅ |
| **Attendance** | Mark student attendance (bulk) | 🟡 | 🟡 | — | — | ✅ |
| | Student attendance view (summary/history) | 🟡 | 🟡 | ✅ | ✅ | — |
| | Section/school reports | 🟡 | 🟡 | — | — | 🟡 |
| | Staff attendance (mark + self-view) | 🟡 | 🟠¹ | — | — | ✅(view) |
| | Student leave request | ✅ | 🟠² | 🟠³ | ✅ | — |
| | Leave review (approve/reject) | 🟡 | 🟠² | — | — | — |
| **Examination** | Grading scales / exam types | 🟡 | 🟡 | — | — | — |
| | Exam schedules (bulk) | 🟡 | 🟡 | — | — | ✅(view) |
| | Marks entry (bulk) | 🟡 | 🟡 | — | — | ✅ |
| | Result compute (term) | 🟡 | 🟡 | — | — | — |
| | Report card / marksheet view | 🟡 | 🟡 | ✅ | ✅ | — |
| | **Annual GPA / final grade** | 🟠⁴ | 🟠⁴ | 🟠⁴ | 🟠⁴ | — |
| | **Result PDF / publish step** | ❌⁵ | 🟠⁵ | ❌ | ❌ | — |
| **Finance** | Fee categories / structures | 🟡 | 🟡 | — | — | — |
| | Student fee assignments | 🟡 | 🟡 | — | — | — |
| | Invoice generation (single/bulk) | 🟡 | 🟡 | — | — | — |
| | **Payment capture (record payment)** | 🟡 | 🟡 | — | — | — |
| | Fee status / ledger view | 🟡 | 🟡 | — | ✅ | — |
| | Collection / defaulter reports | 🟡 | 🟡 | — | — | — |
| | **Online payment gateway** | ❌⁶ | ❌⁶ | ❌ | ❌⁶ | — |
| **HR** | Departments / designations | 🟡 | 🟡 | — | — | — |
| | Staff profiles (+ documents) | 🟡 | 🟡 | — | — | ✅(self) |
| | Staff leave (apply + review) | 🟡 | 🟡 | — | — | ✅(apply) |
| | Payroll (months / slips / finalize) | 🟡 | 🟡 | — | — | — |
| **Library** | Categories / books / copies | 🟡 | 🟡 | — | — | — |
| | Members | 🟡 | 🟡 | — | — | — |
| | Issue / return / fines | 🟡 | 🟡 | ❌⁷ | ❌⁷ | ❌⁷ |
| **Communication** | Notices (one-way broadcast) | 🟡 | 🟡 | ✅(read) | ✅(read) | 🟡(create) |
| | SMS (Sparrow, mock-default) | 🟠⁸ | 🟡 | — | — | — |
| | In-app notifications | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 |
| | Push delivery (Expo send) | ❌⁹ | — | 🟠⁹ | 🟠⁹ | 🟠⁹ |
| | **Two-way parent↔teacher messaging** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Dashboard** | School overview / weekly / activity | 🟡 | 🟡 | — | — | 🟡 |
| **Settings** | School profile + branding | 🟡 | 🟡 | — | — | — |
| **Super-Admin** | Plans / tenants / impersonation / analytics / audit | 🟡 | 🟡 | — | — | — |
| | **Guided school onboarding wizard** | ❌¹⁰ | ❌¹⁰ | — | — | — |

**Footnotes**
1. ¹ Staff attendance *marking* endpoint exists (`POST /attendance/staff/bulk`) but no clear dedicated web UI surfaced for marking staff in/out; self-view is mobile-only (teacher My-Attendance).
2. ² Web `/hr/leave` reviews **HR/staff** leave (`PATCH /hr/leave/:id/review`). The **student** leave loop (`POST /attendance/leave` → `PATCH /attendance/leave/:id/review`) has a *backend* review endpoint but **no surfaced web UI** to action pending student leaves. See Task 3 #1.
3. ³ Student mobile app is read-only — a student cannot file leave from mobile (only the parent can, on the child's behalf).
4. ⁴ Annual GPA + final grade are **hardcoded `null`** at `result.service.ts:528-529` despite `weightedPercentage` being computed two lines above. Term results work; the annual roll-up does not.
5. ⁵ No server-side PDF generation anywhere (zero `pdf`/`puppeteer`/`@react-pdf`/`pdfkit` deps). Report-card/marksheet "print" is **browser `window.print()` + `@media print` CSS** (`components/exams/report-card.tsx:53`, `exams/results/page.tsx:292`). No publish/`is_published` flag — results are live the moment they compute (no gated release).
6. ⁶ Zero references to eSewa / Khalti / ConnectIPS / Fonepay anywhere. Payment `method` is a free-string field; only manual back-office recording exists. Parents cannot pay from mobile.
7. ⁷ Library has full backend + web UI but **zero mobile** surface (no library code in `apps/mobile`).
8. ⁸ Sparrow SMS is really integrated (`sms.service.ts` calls `api.sparrowsms.com`) but **defaults to MOCK** unless `SPARROW_SMS_ENABLED=true` — logs `[SMS MOCK]` and writes status `MOCK`.
9. ⁹ Device-token registry works (mobile registers Expo token on login → `POST /communication/devices`), but there is **no send path** — no `expo-server-sdk`, tokens are stored and never consumed. In-app notifications are DB rows only; nothing pushes to the device.
10. ¹⁰ `TenantProvisioningService.provision()` creates the schema + admin user, but after that a school must hand-build years→classes→sections→subjects→staff→students→timetable via raw CRUD. No wizard. Seed exists only as a demo script.

---

## Task 2 — Role capability map

### PLATFORM_ADMIN (SaaS owner) — web only
- **Can do today:** Log in to super-admin portal; onboard/suspend/activate tenants; manage subscription plans; impersonate a school owner (1h token, audited); view platform analytics (overview + revenue) and audit log; edit platform settings. *(All web, code-present 🟡 — not proven live this audit.)*
- **Missing / partial:** No guided post-provisioning school setup; no cross-tenant data export.

### SCHOOL_OWNER / PRINCIPAL — web (full admin surface)
- **Can do today:** Everything in the school portal — dashboard, academic setup, attendance marking + reports, exams (schedule/marks/term results), finance (structures/invoices/**record payments**/reports), HR (staff/leave-review/payroll), library, notices/SMS, students CRUD, settings/branding.
- **Missing / partial:** Action **student** leave requests (no web UI); release/publish results; generate real PDFs (only browser print); accept online payments; export data.

### ACADEMIC_COORDINATOR — web (shared school surface)
- **Can do today:** Academic setup, attendance marking, exam scheduling/marks/results, review **HR/staff** leave, manage students. *(No dedicated UI; uses role-gated school pages.)*
- **Missing / partial:** Same gaps as principal for the student-leave loop and results publish.

### ACCOUNTANT — web
- **Can do today:** Full finance — fee categories/structures/assignments, generate invoices, **record payments** (`POST /finance/payments` is allowed for ACCOUNTANT), view collection/defaulter reports; run payroll months/slips. So: **yes, an accountant can collect (record) a payment, not just view invoices.**
- **Missing / partial:** No online gateway to collect *from parents*; no receipt PDF; no export.

### LIBRARIAN — web
- **Can do today:** Manage categories/books/copies/members, issue/return books, mark lost, collect fines. Backend + web present.
- **Missing / partial:** No mobile counterpart; no patron-facing catalog for students/parents.

### TEACHER — mobile (proven) + web
- **Can do today (mobile, ✅ proven):** View profile/timetable/sections; **mark student attendance** for a section+date; **enter exam marks** (theory/practical, absent, remarks); **apply for own leave** + view own leave history; view own staff-attendance record.
- **Missing / partial:** Cannot view/manage student leave requests; no library; relies on web for richer reporting; receives no push notifications.

### STUDENT — mobile (proven, read-only)
- **Can do today (✅ proven):** View own profile/enrollment, attendance (BS calendar + summary), today's timetable, exam results/report-card, school notices.
- **Missing / partial:** **Cannot file leave** from mobile; no fee/ledger view (parent-only); no annual GPA (stubbed); no library; no push.

### PARENT — mobile (proven)
- **Can do today (✅ proven):** Switch between children; view per-child attendance, timetable, results/report-card, **fee ledger** (read); read school notices; **file a leave request for a child** (only write action; server-scoped to own guardians).
- **Missing / partial:** **Cannot pay fees** (no gateway); does not get notified when the child's leave is approved/rejected; no two-way messaging with teachers; no push.

---

## Task 3 — Half-built workflow hunt (workflows that start but can't complete)

### 1. Student leave-approval loop — 🟠 **incomplete (no admin action UI + no notify-back)**
- **Exists:** Parent files `POST /attendance/leave` from mobile (✅ proven). Backend review endpoint `PATCH /attendance/leave/:id/review` exists with PENDING→APPROVED/REJECTED transition + `reviewed_by`/`reviewed_at`.
- **Missing to make usable:** (a) a **web UI** for coordinator/principal to see and action pending *student* leaves — `/hr/leave` only handles staff leave, not the `attendance/leave` queue; (b) a **notify-back** to the applicant — no leave notification listener exists, so the parent never learns the outcome in-app. The request goes into a queue nobody can see and nobody is told about.

### 2. Results last mile — 🟠 **term works, annual + release missing**
- **Exists:** Term result compute (marks→grade→rank), report-card view (web + student/parent mobile).
- **Missing:** (a) **Annual GPA/final-grade hardcoded `null`** (`result.service.ts:528-529`) — the weighted percentage is computed but discarded; (b) **no PDF generation** — "marksheet" is browser `window.print()`; (c) **no publish/release step** — results are visible to students/parents the instant a teacher's marks compute, with no review-and-publish gate.

### 3. Fee collection vs invoicing — 🟠 **billing + manual capture work; no online collection**
- **Exists:** Full invoicing (single/bulk), ledger, defaulter reports, and **manual payment capture** (`POST /finance/payments`, atomic invoice-status update, allowed for accountant). Back-office collection is complete.
- **Missing:** **No payment gateway** (eSewa/Khalti/ConnectIPS/Fonepay all absent). Parents see balances on mobile but **cannot pay**; every payment must be keyed in by staff. No receipt PDF.

### 4. Communication — 🟠 **one-way only**
- **Exists:** Notices (broadcast), SMS (Sparrow, mock-default), in-app notification rows.
- **Missing:** **No two-way parent↔teacher messaging / threads / chat** anywhere in the codebase. Notices and SMS are strictly outbound; there is no inbound or conversational channel.

### 5. Library — 🟠 **backend + web complete, mobile absent**
- **Exists:** Full backend (categories/books/copies/members/issue/return/fines) and full web UI (`/library/*`).
- **Missing:** **Zero mobile** — students/parents have no catalog browse, no "what have I borrowed / when is it due" view. Librarian has no mobile tool either.

### 6. Tenant onboarding / provisioning — 🟠 **schema provisioned, setup is raw CRUD**
- **Exists:** `TenantProvisioningService.provision()` creates the tenant schema, subscription, and admin user; super-admin web can onboard a school.
- **Missing:** **No guided setup flow.** After provisioning, the school owner faces an empty system and must manually create academic year → classes → sections → subjects → staff → students → timetable → fee structures, navigating ~8 separate pages with implicit ordering (e.g. academic-year-then-set-current is a documented two-step gotcha). The only "populated" path is the demo seed script. This is the single biggest barrier to a *new* school self-starting.

---

## Task 4 — Production-readiness checklist

| Item | Status | Evidence / note |
|---|:--:|---|
| Payment gateway (eSewa/Khalti/ConnectIPS/Fonepay) | ❌ Absent | Zero SDK/API refs; `method` is a free string; manual recording only |
| Push notifications (Expo) | 🟠 Partial | Device-token registry + login-time registration present; **no send path** (`expo-server-sdk` absent, tokens never consumed) |
| Object storage (photos / docs / report-cards) | 🟠 Partial | No S3/R2/multer. Files are **base64 data-URLs stored in Postgres** (`readAsDataURL` in students/staff/settings/super-admin). Works, but bloats rows and won't scale to report-card PDFs |
| School onboarding flow | 🟠 Partial | Provisioning creates schema+admin; **no guided setup wizard** (raw CRUD afterward) |
| Offline resilience (esp. attendance) | ❌ Absent | No write queue / sync-on-reconnect; attendance marking is a live API call only |
| App-store + OTA deployment (EAS) | ❌ Absent | No `eas.json`; `app.json` has no updates config; no release CI/CD |
| Error monitoring | ❌ Absent | No Sentry/Bugsnag/Datadog anywhere |
| Data export / backup | ❌ Absent | No CSV/XLSX export endpoints; `DataTable` references `exportConfig` but no implementation |
| Minors'-data privacy controls | ❌ Absent | No consent capture, data-retention, redaction, or guardian-consent gating found; student PII (incl. photos as base64) stored without privacy tooling |
| SMS provider (Sparrow) | 🟠 Partial | Real integration but **mock-by-default** (`SPARROW_SMS_ENABLED` flag) |

---

## Biggest gaps to functional (the 5–8 items between today and a school running daily)

1. **Online payment collection.** Invoicing and manual capture work, but with **no gateway** (eSewa/Khalti/ConnectIPS/Fonepay) a parent can see a balance and do nothing about it. For a Nepali school SaaS this is table-stakes, not a nice-to-have.
2. **Student leave loop has no admin side.** Parents file leave from mobile into a queue with **no web UI to approve/reject** and **no notify-back**. The most-used parent write action dead-ends.
3. **Results release is unfinished.** **Annual GPA/grade is stubbed `null`**, there's **no publish gate** (marks go live instantly), and "marksheets" are browser-print only — no real PDF. A school can't run an exam cycle end-to-end.
4. **Push notifications don't deliver.** Tokens are collected but nothing sends. An attendance/leave/fee/notice system whose alerts never reach a phone loses most of its day-to-day value.
5. **No guided school onboarding.** A newly provisioned tenant is an empty shell requiring ~8 ordered manual setup steps. Without a wizard (or templated defaults), self-serve onboarding isn't realistic — every new school needs hand-holding.
6. **No object storage + no offline attendance.** Photos/docs/report-cards live as base64 in Postgres (won't scale, especially once PDFs exist), and teachers marking attendance need a live connection — fragile on Nepali school Wi-Fi.
7. **No deploy/observability baseline.** No EAS (can't ship the apps to stores or push OTA fixes), no error monitoring (production failures are invisible), no data export/backup (schools can't get their data out).
8. **Communication is one-way.** Notices/SMS broadcast outward; there's **no parent↔teacher messaging**, the channel schools most expect for daily interaction.

*Note on confidence:* Mobile student/parent/teacher surfaces are ✅ (proven live in prior sessions). Web and backend are marked 🟡 **present-but-unverified** — the code exists and wires to real APIs via TanStack Query, but this audit did not live-verify each web flow end-to-end. The ❌/🟠 items above are the high-confidence gaps (verified by code absence or smoking-gun stubs).
