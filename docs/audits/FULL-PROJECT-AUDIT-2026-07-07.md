# Full Project Audit — Aaramva Shikshya (2026-07-07)

Whole-project review across `apps/api`, `apps/web`, `apps/mobile`, `packages/`, infra, and docs.
Method: four parallel deep-exploration passes (backend, web, mobile, infra/docs), synthesized here.

## Verdict

The project is a **feature-complete development build** of a genuinely substantial school ERP:
17 backend modules with strong multi-tenant isolation, a web portal that covers every module,
and three polished role-based mobile apps. What it is **not yet** is production-ready — there is
no CI/CD, no containerized deploy, no health checks/monitoring/backups, no tenant-schema
migration runner, several security hardening gaps, and the four revenue-critical integrations
(online payments, S3 file storage, push delivery, email) are stubs.

---

## 1. Feature inventory (what's built)

### Backend — `apps/api` (NestJS 11 + Prisma 6, schema-per-tenant)
- **Tenancy core**: `TenantMiddleware` (header/subdomain → AsyncLocalStorage), `TenantPrismaService`
  (`SET LOCAL search_path` per request, regex-guarded schema names, fully parameterized raw SQL).
  Tenant tables (~45) created from `tenant-schema.sql` DDL at provisioning; public schema in Prisma.
- **Auth/RBAC**: self-serve school registration, login/refresh/logout (web cookie + mobile body via
  `X-Client-Type`), rotating SHA-256-hashed refresh tokens, bcrypt-12, 9-role RBAC with
  `@Roles` + `RolesGuard` on every feature controller, object-level self-scoping (PARENT→own child,
  staff→own records, student `/me` routes never accept IDs).
- **Domain modules (all complete)**: Student (admission, CRUD, CSV import, guardian/student account
  provisioning, `/me` self-service incl. report-card PDF), Academic (years/classes/sections/subjects/
  timetable with bulk replace), Attendance (student bulk UPSERT, staff, leave), Finance (fee
  categories/structures/assignments, invoices with discount/waiver/fines, atomic payments,
  collection/defaulter/ledger reports), HR (departments, staff profiles + docs, leave, payroll with
  idempotent slip generation), Examination (grading scales, exam types/schedules, marks UPSERT,
  idempotent result pipeline marks→grade→rank, weighted report cards, pdfkit PDFs), Communication
  (notices, Sparrow SMS with Nepal phone normalization + mock gate, in-app notifications, device
  tokens, event listeners), Library (books/copies/members, issue/return/fines, GIN full-text search),
  Dashboard (overview/weekly/activity/upcoming), Settings + branding color extraction (node-vibrant
  + WCAG contrast), Super Admin (plans, tenant onboard/suspend, impersonation with audit,
  analytics), Onboarding wizard state.
- **Jobs**: one BullMQ cron (daily fine recalculation, 00:05 NPT) — gated off while Redis is disabled.
- **Tests**: 44 spec files, 251+ service-layer unit tests. Controllers/e2e essentially untested.

### Web — `apps/web` (Next.js 16 App Router, React 19, Tailwind v4)
- Full UI coverage of every backend module: students (list/overview/new/detail/edit/import),
  attendance (mark/requests/reports), academic (years/classes/subjects/timetable), finance
  (invoices/fee-structures/reports), exams (types/schedule/marks/results/report cards), HR
  (staff/leave/payroll/setup), library (books/members/issues), communication (notices/SMS/
  notifications), dashboard (recharts), settings, onboarding wizard, and a complete super-admin
  portal (schools, plans, revenue, audit, impersonation handoff).
- Clean architecture: axios layer per module (`lib/api/*.api.ts`), TanStack Query hooks per module,
  Zustand (access token memory-only), RHF+Zod on big forms, shadcn/ui, shared `DataTable`/`BsDate`/
  `StatusBadge`/`PageHeader`/`EmptyState`/`ConfirmDialog`/`StatCard`, 1266-line `types/api.types.ts`.
  Zero useEffect+fetch, zero localStorage tokens, zero TODO/FIXME.

### Mobile — `apps/mobile` (Expo SDK 56, expo-router, NativeWind 4)
- Onboarding: school-code entry → tenant verify → branded login; multi-school session store
  (SecureStore refresh tokens, in-memory access tokens); per-school runtime theming (ThemeSync +
  HSL-derived ramps from `--primary`); BS calendar pervasive.
- **Student**: dashboard, BS-month attendance calendar, today's timetable, results + PDF download,
  notices, profile. **Parent**: multi-child dashboard with child switcher, attendance calendar,
  results, fees (view-only ledger), request-leave, notices, profile. **Teacher**: dashboard, weekly
  routine, bulk attendance marking (virtualized roster), 3-step marks entry with validation, own
  attendance, leave apply/list, profile.
- Excellent loading/error/empty/pull-to-refresh coverage; shared token-driven UI library
  (`components/ui/` — ScreenHeader, Card, AttendanceCalendar, TodayClasses, etc.).

### Packages
- `packages/bs-calendar`: healthy — AD↔BS for BS 2000–2100, fiscal year (Shrawan), en/np month
  names, 13 tests. Consumed by all three apps (via three different mechanisms — see risks).
- `packages/database`: **orphaned** (stale schema copy, dead seed script) — should be deleted.
- `packages/shared`: **does not exist** despite CLAUDE.md referencing it.

---

## 2. Required changes (prioritized)

### P0 — Security
1. **JWT fallback secret** `'change-me-access'` in `apps/api/src/.../jwt.strategy.ts:13` — app must
   fail-fast when `JWT_ACCESS_SECRET` is unset.
2. **Throttler configured but never enforced** — `ThrottlerModule` in `app.module.ts` has no
   `APP_GUARD`; login/refresh/register/SMS are unthrottled. `register-school` is public, unthrottled,
   and provisions a whole Postgres schema per call (DoS/abuse vector).
3. **No web-side RBAC** — `components/layout/school-shell.tsx:33` only checks token truthiness; any
   authenticated user (teacher, accountant) sees the full sidebar incl. Finance/HR/Payroll. No
   `middleware.ts`, all guards are client-side `useEffect` redirects.
4. **DB password committed** — `<REDACTED>` in tracked `CLAUDE.md:302` (in git history). Rotate the
   local password and scrub the line.
5. No `helmet`/security headers on the API; impersonation tokens carry no impersonation claim.

### P0 — Correctness bugs
6. **Mobile `toISOString()` timezone off-by-one** (UTC+5:45): teacher `attendance.tsx:24` POSTs the
   attendance date, `leave.tsx:36` POSTs leave dates, `my-attendance.tsx:51` and parent
   `attendance.tsx:56` build query ranges — all can hit the wrong AD day. Route through
   `localDateKey(bsToAd(...))` (already exists in `lib/time.ts` and used correctly elsewhere).
7. **Guardians dual source of truth** — normalized `guardians` table coexists with legacy
   `students.guardians` JSONB; `sms.service.ts` and `finance.listener.ts` still read the JSONB.
8. Legacy denormalized `students.class_name`/`section_name` still live alongside FK columns.

### P1 — Operations / production readiness
9. **No tenant-schema migration runner** — the single biggest DB-ops risk. Schema changes for
   existing tenants are hand-interspersed idempotent ALTERs in `tenant-schema.sql`; no versioned
   ledger, no way to roll a change across all `tenant_*` schemas. Build a `_tenant_migrations`
   ledger + ordered idempotent steps.
10. **No CI/CD** — `.github/` does not exist (CLAUDE.md claims GitHub Actions). 264+ tests never run
    automatically. No Dockerfiles for api/web (compose is dev-services only), no deploy configs.
11. **No health checks / monitoring / backups** — no `/health` endpoint, no Sentry, no structured
    logging, no request logging, no backup cron/restore runbook. Redis off → the fine-recalc cron is
    silently disabled everywhere.
12. **No API docs** — Swagger absent.

### P1 — Integration stubs blocking the product promise
13. **Online payments not integrated** — eSewa/Khalti are manual-record enums only; no gateway
    init/verify/callback code; ConnectIPS absent.
14. **No real file storage** — base64-in-JSON with a 5 MB body limit; `AWS_*` env unused; no S3/R2,
    no presigned uploads.
15. **Push notifications half-built** — device tokens registered (login-only, env-var dependent) but
    no send path on the backend and no receive handlers/channels/deep-link routing in the app; bell
    badge is a hardcoded dot.
16. **No email at all** — hence no password reset anywhere (web "Forgot password?" is `href="#"`).

### P2 — Mobile release plumbing
17. No `eas.json`, no `extra.eas.projectId`/`owner`/`runtimeVersion`, no platform build numbers, no
    FCM `google-services.json`, no privacy policy / iOS usage strings / account-deletion path.

### P2 — Functional gaps & polish
18. Parent weekly timetable screen is fully built but **unreachable** (`href:null`, nothing navigates
    to it). Teacher has **no notices screen** (feed exists for student/parent); teacher bell
    mis-navigates to profile.
19. Dead stubs shipped: `(parent)/home.tsx`, `(teacher)/home.tsx` ("Coming in Session 21"),
    `web-portal.tsx` (ADMIN landing) — all render raw AD dates via legacy `BsDate`.
20. Web: defaulter export is a `console.log` (`finance/reports/page.tsx:150`); grading-scale CRUD UI
    missing (read-only wired); query-level error UI absent (silent empties); stub
    `communication/page.tsx`.
21. Student timetable is today-only (parent/teacher have weekly); parent results lacks PDF download;
    guardian profile is synthesized from email (no guardian profile endpoint).
22. Four near-duplicate BS date-picker widgets on mobile; older screens use `fontWeight` with custom
    fonts (renders regular weight); unused dark-mode CSS.
23. i18n absent — `BS_MONTH_NAMES_NP` and Devanagari font wiring exist but all UI copy is
    English-only, despite the Nepal-market positioning.
24. Repo hygiene: not a real npm workspace (three consumption mechanisms for bs-calendar, one
    depends on committed `dist/`); stray root/`apps/web` `.expo/` untracked and un-ignored; orphaned
    `packages/database`; stale CLAUDE.md monorepo map (`packages/shared`, `docs/architecture.md`,
    `docs/decisions/` don't exist); duplicate root docs; stale agent worktree under
    `.claude/worktrees/`.

---

## 3. Features to add (roadmap)

**Phase A — close the loop on what's promised** (highest product value)
- Online fee payment: eSewa + Khalti checkout/verify/callback, receipts, reconciliation; ConnectIPS.
- Push delivery: Expo send service on notice/result/absence/invoice events + in-app inbox with real
  unread counts + notification→deep-link routing.
- Email service (SES/SMTP): password reset (web+mobile), credential delivery, invoice/notice email.
- S3/R2 presigned uploads for photos, logos, signatures, staff/student documents.

**Phase B — module roadmap from CLAUDE.md (still unbuilt)**
- E-Learning: assignments/homework (teacher post, student submit, parent view), study materials.
- Reports module: cross-module analytics + exports (admissions, attendance trends, exam analytics,
  fee aging) — only finance reports exist today.
- Inventory/Assets.

**Phase C — competitive school-ERP features**
- Exam schedule as a first-class student/parent screen; weekly student timetable.
- Teacher↔parent messaging/chat; events/holiday calendar (BS); gallery.
- ID cards + certificates (transfer/character certificates — IRD/NEB formats).
- Transport (routes/fees; later GPS), hostel, admissions inquiry CRM.
- Nepali i18n toggle (mobile first — `NpText` infra already exists).
- Biometric login on mobile; offline read cache for attendance/timetable.

**Suggested order**: P0 security + the toISOString bug (days) → tenant migration runner + CI +
health/Sentry/backups (a week) → payments + S3 + push + email (the product-completing phase) →
EAS release plumbing → Phase B/C features.
