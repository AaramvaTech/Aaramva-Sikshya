# Aaramva Shikshya (आरामवा शिक्षा) — Claude Code Project Memory

## Project overview
**Aaramva Shikshya** is a multi-tenant SaaS school management system (SMS/ERP) for Nepal.
Product tagline: "Simple school management for every school in Nepal."
Each school is a **tenant** with isolated data, custom branding, and a subscription plan.
Target market: Schools and colleges in Nepal. Must support Nepali BS calendar and local payment gateways.

App domain: `aaramvashikshya.com` (update when live)
Dev domain: `localhost` (use X-Tenant-Slug header for local testing)

---

## Tech stack (DO NOT deviate without updating this file)

| Layer | Technology | Notes |
|---|---|---|
| Backend framework | NestJS (TypeScript) | Monorepo with @nestjs/cli |
| ORM | Prisma | Schema-per-tenant multi-tenancy |
| Primary DB | PostgreSQL 16 | One DB, multiple schemas |
| Cache / Queue | Redis + BullMQ | Sessions, background jobs |
| File storage | AWS S3 (or Cloudflare R2) | Student docs, photos, PDFs |
| Frontend (web) | Next.js 14 (App Router) | Admin portal, teacher/parent dashboard |
| Mobile | React Native + Expo | Student app, Parent app, Teacher (Guru) app; Expo SDK 56, expo-router (file-based routing, app/ dir) |
| API style | REST (primary) + WebSocket (real-time) | No GraphQL unless specified |
| Auth | JWT (access + refresh tokens) | Stored in httpOnly cookies |
| Containerization | Docker + docker-compose | Dev environment |
| CI/CD | GitHub Actions | On push to main → staging, on tag → prod |

---

## Monorepo structure

```
/
├── CLAUDE.md                  ← YOU ARE HERE — read this every session
├── apps/
│   ├── api/                   ← NestJS backend (main)
│   ├── web/                   ← Next.js admin portal
│   └── mobile/                ← React Native (Expo)
├── packages/
│   ├── database/              ← Prisma schema + migrations + seed
│   ├── shared/                ← Shared types, DTOs, constants
│   └── bs-calendar/           ← Nepali BS/AD calendar utilities
├── docs/
│   ├── architecture.md        ← System design decisions
│   ├── api-contracts/         ← Per-module API specs
│   └── decisions/             ← ADR (Architecture Decision Records)
├── docker-compose.yml
└── .github/workflows/
```

---

## Multi-tenancy pattern — CRITICAL, read before touching any DB code

We use **schema-per-tenant** in PostgreSQL.

- Each school gets its own Postgres schema: `tenant_<slug>` (e.g. `tenant_sxs`, `tenant_navodaya`)
- A shared `public` schema holds: `tenants`, `subscriptions`, `plans` tables only
- The `TenantService` resolves tenant from subdomain on every request
- `AsyncLocalStorage` stores the current tenant context for the request lifecycle
- Every Prisma query must go through `TenantPrismaService` which sets `search_path` before each query

**Never use the default PrismaService directly in module code — always use TenantPrismaService.**

Subdomain routing: `schoolname.yourdomain.com` → tenant slug = `schoolname`

---

## Authentication & authorization

- JWT access token: 15 min expiry
- JWT refresh token: 7 days, stored in httpOnly cookie (web) or returned in response body (mobile — see Mobile API conventions)
- RBAC roles (in order of privilege):
  1. `PLATFORM_ADMIN` — you (the SaaS owner)
  2. `SCHOOL_OWNER` — founder/proprietor of a school
  3. `PRINCIPAL`
  4. `ACADEMIC_COORDINATOR`
  5. `ACCOUNTANT`
  6. `LIBRARIAN`
  7. `TEACHER`
  8. `STUDENT`
  9. `PARENT`
- Use `@Roles(...roleNames)` guard on every controller method
- Every tenant-scoped entity has a `tenantId` field (redundant safety check alongside schema isolation)

---

## Naming conventions

- Files: `kebab-case.ts` (e.g. `student.service.ts`)
- Classes: `PascalCase` (e.g. `StudentService`)
- Database tables: `snake_case` (Prisma default)
- API routes: `/api/v1/<resource>` (plural, kebab-case)
- DTOs: `CreateStudentDto`, `UpdateStudentDto`, `StudentResponseDto`
- Enums: `SCREAMING_SNAKE_CASE` values, PascalCase name (e.g. `enum Gender { MALE, FEMALE, OTHER }`)

---

## Git & GitHub conventions

**Standing rule:** Claude Code never merges PRs, closes PRs, or performs GitHub account actions beyond `git push`, unless the current instruction explicitly says to. If a dependency is unmerged, stop and ask.

---

## Agent workflow conventions

**Standing rule: never call `ScheduleWakeup` (or any self-scheduling / delayed-re-injection primitive) in this project.** This project's workflow is checkpoint → stop → wait for explicit human input. `Monitor` and backgrounded `Bash` already deliver completion notifications for anything worth waiting on — there is no legitimate use here for a mechanism that resumes work on its own timer without a human turn in between.

Found live 2026-07-29 (BILL-5 Checkpoint A): used twice as an ad-hoc fallback alongside `Monitor` for background waits (waiting on a dev-server recompile, then a bill-run poller drain). The second call replayed its saved prompt into the conversation as a new turn *after* the real `Monitor` notification had already resolved the wait and the checkpoint had moved on — indistinguishable from a genuine user message, and exactly the kind of unrequested, timer-driven resumption this rule exists to prevent.

---

## Module build order (follow this sequence)

1. ✅ **Foundation** — Tenant resolution, Auth (JWT), RBAC, TenantPrismaService
2. ✅ **Student** — Admission, profiles, class assignment
3. ✅ **Academic** — Classes, sections, subjects, timetable
4. ✅ **Attendance** — Student and staff daily attendance
5. ✅ **Finance** — Fee structure, invoices, payments
6. ✅ **HR & Staff** — Staff profiles, leave, payroll
7. ✅ **Examination** — Exams, marks, report cards
8. 🟨 **E-Learning** — Assignments ✅ (EDU-1 api+web, EDU-2 mobile); materials, online classes pending
9. ✅ **Communication** — Notices, SMS, push notifications
10. ✅ **Library** — Books, issue/return, fines
11. ⬜ **Inventory** — Assets, stock
12. ✅ **Dashboard** — School dashboard (overview, weekly attendance, activity feed, upcoming exams, class-wise breakdown, quick actions)
13. 🟨 **Reports** — Attendance/exam/fee-aging analytics + CSV (REP-1); PDF/scheduled exports pending
13. ✅ **Super Admin** — Platform-level school management
14. ✅ **Super Admin UI** — Platform admin portal (Session 17)

---

## Nepal-specific requirements

- **BS Calendar**: All date displays use Bikram Sambat. Use `packages/bs-calendar` for all conversions.
  - Never use raw JS Date for user-facing dates without converting to BS first.
  - Store all dates in PostgreSQL as AD (standard) — convert only at display/input layer.
- **Payment gateways**: eSewa, Khalti, ConnectIPS for fee collection
- **SMS provider**: Sparrow SMS (Nepal) for notifications
- **IRD compliance**: Billing invoices must follow Nepal's IRD format (fiscal year: Shrawan–Ashadh)
- **Fiscal year**: Nepali fiscal year starts mid-July (1 Shrawan). Fee structures are fiscal-year based.

---

## Code patterns to always follow

### NestJS module structure (every module looks like this)
```
apps/api/src/modules/<module-name>/
├── <module>.module.ts
├── <module>.controller.ts
├── <module>.service.ts
├── dto/
│   ├── create-<module>.dto.ts
│   ├── update-<module>.dto.ts
│   └── <module>-response.dto.ts
├── entities/
│   └── <module>.entity.ts        ← Prisma type re-exports + transformers
└── __tests__/
    ├── <module>.service.spec.ts
    └── <module>.controller.spec.ts
```

### Response format (ALL API responses must follow this)
```typescript
// Success
{ success: true, data: <payload>, meta?: { page, limit, total } }

// Error
{ success: false, error: { code: string, message: string, details?: any } }
```

### Pagination (all list endpoints must support this)
Query params: `?page=1&limit=20&search=&sortBy=createdAt&sortOrder=desc`

### Soft deletes
All main entities use soft delete: `deletedAt DateTime?` field.
Never use Prisma `delete()` — always `update({ data: { deletedAt: new Date() } })`.

**Exception: `device_tokens` table has NO `deletedAt`.** Hard delete only. Stale push tokens cause silent send failures with zero audit value — a hard delete is the correct semantic here. Do not "fix" this by adding `deletedAt`.

---

## Mobile API conventions (added Session 19)

React Native clients (Expo) cannot reliably use httpOnly cookies.

### `X-Client-Type: mobile` header
Send on all auth requests. Absence or any other value = web behavior (unchanged).

| Endpoint | Web (no header) | Mobile (`X-Client-Type: mobile`) |
|---|---|---|
| `POST /auth/login` | refresh token in httpOnly cookie | refresh token in response body; no cookie set |
| `POST /auth/refresh` | reads cookie | reads `{ refreshToken }` from body; missing body → 401 (no fallback to cookie) |
| `POST /auth/logout` | reads + clears cookie | reads `{ refreshToken, expoPushToken? }` from body; clears device token if expoPushToken given |

Services receive `clientType: 'web' | 'mobile'` as a plain arg — use the `@ClientType()` param decorator in controllers.

### Guardian → Parent account linkage
The `guardians` table has a nullable `user_id UUID REFERENCES users(id)`. Most guardian rows have `user_id = NULL`. When an admin creates a parent account via `POST /students/:studentId/guardians/:guardianId/account`, a `users` row with `role = PARENT` is created and `guardian.user_id` is set. A single parent user may be linked to multiple guardian rows (one per child).

`GET /students/my-children` (PARENT role only) JOINs `students` + `guardians` on `guardian.user_id = currentUser.id`.

### Public tenant verification (no auth, no X-Tenant-Slug)
`GET /api/v1/tenants/verify/:slug` — reads the public schema to confirm a school exists and is active. Throttled 10/min. Used by the mobile app's school-code entry screen before showing login. This route is excluded from TenantMiddleware.

---

## Mobile app conventions (added Session 20)

**Location:** `apps/mobile/` — Expo SDK 56 managed workflow

**Routing:** expo-router (file-based). Route files in `app/`:
- `app/index.tsx` — school code entry (no auth)
- `app/login.tsx` — login screen
- `app/_layout.tsx` — root layout + auth-state routing
- `app/(student)/`, `app/(parent)/`, `app/(teacher)/` — role-scoped screens
- `app/web-portal.tsx` — admin role redirect

**Token storage contract (DO NOT deviate):**
- Access token: in-memory only (Zustand `useAuthStore.accessToken`). Never written to disk.
- Refresh token: `expo-secure-store` key `"refreshToken"` (Keychain/Keystore)
- Tenant slug: `expo-secure-store` key `"tenantSlug"` (persisted across cold launches)

**Auth status state machine:**
```
'booting' → reads SecureStore on app launch
  → no slug: 'noSchool' → app/index.tsx
  → slug, no token: 'unauthed' → app/login.tsx
  → slug + token: attempts refresh → 'authed' (or 'unauthed' on failure)
'authed' → role-based tab screen
'unauthed' → app/login.tsx (slug retained so school name is shown)
'noSchool' → app/index.tsx (fresh install or slug wiped)
```

**API client:** `lib/api.ts` — main axios instance auto-injects `X-Client-Type: mobile` + `X-Tenant-Slug`. `rawApi` (no interceptors) used for `/auth/refresh` and `/auth/me` to prevent 401 loops.

**Session 21 needs:** When adding a new screen under a role group, create `app/(student)/newscreen.tsx` (or parent/teacher). Update `app/(student)/_layout.tsx` Stack if a new route needs header config. The root layout's useEffect in `_layout.tsx` controls auth routing — don't add `router.replace()` in individual screens to avoid race conditions.

**Canonical brand color (mobile):** Aaramva primary is `#0B6B43` (`--primary: 11 107 67`), single source of truth in `apps/mobile/lib/theme/tokens.ts` (updated from `#065f46` to match the brand design). Auth + student screens read it only via the `--primary` token / `useThemeColors()` — never a second green literal. **Exception:** the pre-school onboarding flow (`app/index.tsx`) uses an exact-design literal palette (`OB` constant: `#0B6B43`/`#064E33` gradient, `#E9F4EE` band, etc.) plus the design logo assets `assets/images/aaramva-mark.png` + `aaramva-wordmark.png` (rendered untinted) — a documented exception, since onboarding is Aaramva-branded and must match the design pixel-for-pixel. Per-school themes override `--primary` at runtime (ThemeSync → applySchool).
  (BRAND-1: web now derives its full `--color-brand-*` ramp from the same
  per-school `primaryColor`, so `#1a8055` is the Aaramva default only.)

## Mobile shared UI library (added Session: UI/UX top-level pass)

**All role apps (student/parent/teacher) are now token-driven and per-school-branded — no hardcoded brand hex.** Previously parent (navy `#1e3a5f`) and teacher (blue `#1e40af`) screens were on a hardcoded palette that ignored school branding; they were migrated to the same token system the student/auth screens already used. The single brand decision: **every role unifies on the per-school `--primary`** (no per-role accent colors).

**`apps/mobile/components/ui/`** — shared, token-only primitives (barrel export in `index.ts`). Build screens from these; do not re-implement headers/cards/states inline:
- `ScreenHeader` — the one branded gradient header (`headerGradient(c.primary)`), safe-area aware (`useSafeAreaInsets`), with `eyebrow`/`title`/`subtitle`/`right`/`children`/`overlap`/`npTitle` props.
- `Card` + `CARD_SHADOW`/`CARD_SHADOW_LG` (elevation scale), `CardLabel` (uppercase muted section label).
- `EmptyState`, `ErrorState` (cloud-offline + Try again), `LoadingBlock` — consistent boundary states.
- `PrimaryButton` (solid/`soft`, loading, ≥52pt), `StatusBadge`, `HeaderPill`, `HeaderIconButton`.
- `AttendanceSummaryCard` (percent + chips + progress, student & parent), `TodayClasses` (dashboard timetable card), `AttendanceCalendar` (generic BS-month grid taking a `statusConfig` map — student/parent/teacher), `SubjectSlot` (colour-accented period card, student & teacher timetables), `ChildPicker`, `MonthNav` (`card`/`header` variants), `SelectableRow`/`SelectChip` (teacher pickers), `Legend`.

**Decorative palettes (documented exceptions to "tokens only", like `SATURDAY_HIGHLIGHT`):** subject hues in `lib/subjects.ts` (`subjectColor(i)`); semantic status palettes (PRESENT green / ABSENT red / LATE amber / LEAVE blue) stay as literals and match the canonical `STATUS_CONFIG` in `lib/attendance.ts`. These are NOT brand-coupled — never replace them with `--primary`.

**Rule for new mobile screens:** brand colour only via `useThemeColors()` / NativeWind tokens (`bg-primary`, `text-foreground`, `bg-surface`, `text-muted-foreground`, …). Tab bars read `c.primary`/`c.surface`/`c.border` (see any `(role)/_layout.tsx`). Verify with `npx tsc --noEmit` (exits 0).

---

## Environment variables (never hardcode these)

```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
AWS_BUCKET_NAME=
AWS_REGION=
SPARROW_SMS_TOKEN=
ESEWA_PRODUCT_CODE=              ← both this + secret set = gateway enabled (PAY-1)
ESEWA_SECRET_KEY=
ESEWA_FORM_URL=                  ← optional; defaults to rc/UAT sandbox
ESEWA_STATUS_URL=                ← optional; defaults to rc/UAT sandbox
EXPO_ACCESS_TOKEN=               ← optional (PUSH-1); only for EAS enhanced push security
API_PUBLIC_URL=                  ← public API origin for gateway browser redirects
WEB_BASE_URL=                    ← web origin for payment result pages (dev: localhost:3000)
KHALTI_SECRET_KEY=               ← set = Khalti gateway enabled (PAY-2); sandbox key needs merchant signup at test-admin.khalti.com
KHALTI_BASE_URL=                 ← optional; defaults to https://dev.khalti.com/api/v2 (sandbox)
S3_ENDPOINT=                     ← FILE-1: ALL FOUR of endpoint/access/secret/bucket set = storage enabled; any missing = disabled + boot notice (presign 503, legacy base64 still accepted)
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=
S3_REGION=                       ← optional; defaults us-east-1
S3_FORCE_PATH_STYLE=             ← optional; defaults true (MinIO/R2); false for AWS
S3_PUBLIC_URL=                   ← optional public base for school logos; defaults {S3_ENDPOINT}/{S3_BUCKET}
APP_DOMAIN=aaramvashikshya.com   ← used for subdomain resolution
```

---

## What's built so far

- [x] BS Calendar utility package (`packages/bs-calendar/`) — 13 tests passing
- [x] Project scaffolded — NestJS 11 at `apps/api/`
- [x] Docker compose (Postgres + Redis) — `docker-compose.yml` at root
- [x] Prisma 6 schema + migration — `apps/api/prisma/` (public schema: tenants, plans, subscriptions)
- [x] Plans seeded (Basic / Pro / Enterprise) — `npm run seed`
- [x] TenantMiddleware (X-Tenant-Slug header + subdomain → AsyncLocalStorage)
- [x] TenantPrismaService (SET LOCAL search_path per-request schema switching)
- [x] Auth module (register-school, login, refresh, logout, me) — verified live
- [x] RBAC — Role enum, @Roles() decorator, RolesGuard, @CurrentUser(), JwtAuthGuard
- [x] ResponseInterceptor + HttpExceptionFilter + CORS + main.ts fully configured
- [x] Unit tests — AuthService (8) + TenantMiddleware (6) = 14 passing
- [x] Student module (`apps/api/src/modules/student/`) — admission, CRUD, status, soft-delete — 13 unit tests passing
- [x] Academic module (`apps/api/src/modules/academic/`) — academic years, classes, sections, subjects, class-subject assignments, timetable, migration service — 18 unit tests passing (48 total across all modules)
- [x] Attendance module (`apps/api/src/modules/attendance/`) — student bulk attendance (UPSERT), staff attendance, leave applications, absent event emitter — 13 unit tests passing (61 total across all modules)
- [x] Finance module (`apps/api/src/modules/finance/`) — fee categories, fee structures, invoices (with discount/waiver/custom-amount logic), payments (atomic), reports (collection, defaulters, student ledger) — 16 unit tests passing (77 total across all modules)
- [x] JobsModule (`apps/api/src/jobs/`) — BullMQ daily fine recalculation job, cron '20 18 * * *' (00:05 Nepal time)
- [x] HR & Staff module (`apps/api/src/modules/hr/`) — departments, designations, staff profiles (user+profile transaction, EMP-{BS_YEAR}-{4-digit} ID), staff documents, HR leave management (overlap check, review, cancel, balance), payroll months + salary slips (idempotent generation, adjust, finalize) — 19 unit tests passing
- [x] Examination module (`apps/api/src/modules/examination/`) — grading scales with thresholds (NEB/GPA/percentage), exam types (weight validation), exam schedules (bulk create, duplicate guard), marks entry (UPSERT with full validation), result computation (idempotent pipeline: marks→grade→rank), report cards (weighted annual result), rank lists — 12 unit tests passing (108 total passing)
- [x] Communication module (`apps/api/src/modules/communication/`) — notice board (audience-based visibility, publish/draft), SMS via Sparrow SMS (normalise Nepal phone, PENDING→MOCK/SENT/FAILED log, bulk send with deduplication, retry), in-app notifications (create, paginated list, unread count, mark read), event listeners (AttendanceListener → absent SMS, FinanceListener → payment/overdue notifications + SMS) — 22 unit tests passing (130 total passing)
- [x] Library module (`apps/api/src/modules/library/`) — book categories (CRUD), books (add/update/soft-delete, full-text search, copy management), library members (LIB-YEAR-NNNN generation via sequences, student/staff, duplicate guard), issue & return (4 pre-checks, atomic transactions, fine calculation, mark-lost, pay-fine, overdue detection) — 18 unit tests passing (148 total passing)
- [x] Super Admin module (`apps/api/src/modules/super-admin/`) — PublicPrismaService (public schema isolation), TenantProvisioningService (extracted from AuthService, shared with super-admin onboarding), PlatformAuthService (platform_admins login → JWT with tenantId:null), PlanService (CRUD + deactivate), AuditService (platform_audit_logs), TenantAdminService (onboard/suspend/activate/detail/list + subscription management), ImpersonationService (1h SCHOOL_OWNER JWT + audit log), AnalyticsService (overview + revenue) — 16 unit tests passing (164 total passing)
- [x] Super Admin UI (`apps/web/app/(super-admin)/`) — Login page, Dashboard (overview + plan breakdown + recent schools), Schools list (DataTable + Onboard dialog + Suspend/Activate + Impersonation), School detail (info + subscription + usage stats), Plans management (cards + Create/Edit/Deactivate), Audit log (read-only + impersonation rows highlighted orange)
- [x] Staff Profile Page (`apps/web/app/(school)/hr/staff/[id]/`) — Hero card with avatar + photo upload (base64), custom tab bar (Overview/Documents/Leave), Personal Details card, Employment Details card, Emergency Contact card, Documents tab with upload dialog & table, Leave Balance tab. Edit page (`/hr/staff/[id]/edit/`) with React Hook Form + Zod for all editable fields. Backend: photoUrl added to UpdateStaffDto + staff service SQL. Web: staff schema (staff.schema.ts), useUpdateStaff/useStaffDocuments/useAddStaffDocument hooks, StaffDocument type in api.types.ts.
- [x] Dashboard module (`apps/api/src/modules/dashboard/`) — DashboardService (overview aggregation: student count + today's attendance with byClass breakdown + fee collection using current academic year + unread notifications, weekly attendance last 7 days, recent activity feed: students/payments/notices, upcoming exam schedules), DashboardController (4 endpoints: /overview, /weekly-attendance, /activity, /upcoming with RBAC guards), DashboardModule registered in AppModule — 8 unit tests passing (180 total passing)
- [x] School Dashboard UI (`apps/web/app/(school)/dashboard/`) — Fixed all 6 bugs (pending fees missing academicYearId, attendance .percent→.attendanceRate, hardcoded chart data, missing PageHeader, no dashboard hook, no dashboard types). New: StatCard shared component, use-dashboard.ts hooks (useDashboardOverview, useWeeklyAttendance, useRecentActivity, useUpcomingEvents), dashboard.api.ts client, class-wise attendance breakdown, recent activity feed, upcoming exams section, quick action buttons (Mark Attendance, Add Student, Send Notice, Record Payment), dashboard types in api.types.ts
- [x] Mobile Backend Prep (Session 19) — `X-Client-Type: mobile` header on auth endpoints (login/refresh/logout); `@ClientType()` param decorator; mobile gets refresh token in body, no cookie; `GET /api/v1/tenants/verify/:slug` (public, throttled 10/min, excluded from TenantMiddleware); `device_tokens` table + `POST /communication/devices` + `DELETE /communication/devices/:token` (Expo push token registry, hard delete, all roles); `guardians` relational table migrated from JSONB (with JSONB backfill), `user_id FK` for PARENT linkage; `POST /students/:studentId/guardians/:guardianId/account` (creates PARENT user, atomic tx, handles existing-PARENT reuse + 409 conflicts); `GET /students/my-children` (PARENT role only) — 30 new unit tests (194 total passing, 5 pre-existing failures in student-attendance.service.spec.ts unrelated to this session)
- [x] Mobile App scaffold (Session 20) — `apps/mobile/` Expo SDK 56 managed workflow, expo-router, TypeScript strict; auth flow: school code entry → tenant verify → login → secure token storage → auto-refresh → session restore → logout; role-based navigation shell (Student/Parent/Teacher/Admin); NativeWind v4 styling; bs-calendar integration; push token registration (fire-and-forget); Metro monorepo config for packages/bs-calendar access
- [x] Student account linkage (Session 20.5) — `students.user_id UUID FK → users(id)` (nullable, partial unique index, unlike `guardians.user_id` which is non-unique); `POST /students/:id/account` creates STUDENT login + links; `POST /attendance/leave` IDOR fix: STUDENT caller derives studentId from token (never from body), PARENT branch checks `guardians` ownership — 218 unit tests passing (5 pre-existing failures in student-attendance.service.spec.ts)
- [x] Student self-service endpoints (Session 21 Backend) — `StudentMeService` + `student-me.service.ts`; **THE ONE RULE**: no /me route accepts a studentId param — all resolve via `token.userId → students.user_id`; endpoints: `GET /students/me` (profile + enrollment), `GET /students/me/timetable/today` (Nepal timezone-aware, Saturday guard), `GET /students/me/attendance/summary` (percent formula: (present+late)/workingDays), `GET /students/me/attendance/history` (paginated, defaults to current academic year) — 14 new tests; `todayInNepal()` exported from service for unit-testable Date.now() mocking
- [x] Student mobile screens (Session 21 Mobile) — `app/(student)/_layout.tsx` converted to Tabs (Profile/Timetable/Attendance); `app/(student)/home.tsx` — profile card + enrollment + logout; `app/(student)/timetable.tsx` — today's periods with period-number badge, Saturday guard; `app/(student)/attendance.tsx` — percentage + 4-stat row + recent 30-day history; `hooks/useStudentMe.ts` TanStack Query hooks for all 4 /me endpoints; `types/index.ts` populated with StudentProfile, TimetableResponse, AttendanceSummary, AttendanceHistoryItem
- [x] Student mobile screens real-content (Session 22 + cleanup) — `app/(student)/index.tsx` (Dashboard: BS date in header via `todayBs`+`formatBs`, profile+enrollment, attendance summary card using shared STATUS_CONFIG, today's timetable with Saturday guard); `app/(student)/attendance.tsx` rewritten as BS-month calendar grid (`daysInBsMonth` for month length, `bsToAd` for weekday-of-first-day + AD date-range query, month nav with year-boundary handling, Saturday column amber, today cell highlighted, cells colored by STATUS_CONFIG, legend + monthly summary strip); `app/(student)/_layout.tsx` reduced to 2 tabs (Dashboard/index + Attendance); `lib/attendance.ts` — shared STATUS_CONFIG constant (PRESENT/ABSENT/LATE/LEAVE → label/color/bg/dot/shortCode/icon); `hooks/useStudentMe.ts` — added `useAttendanceHistory({ fromDate, toDate })` with paginated extraction (`data.data.data` + `data.data.meta`). Cleanup: deleted `app/(student)/home.tsx` (Session 21 content superseded by index.tsx; was creating phantom 3rd tab in expo-router v3), deleted unused template scaffold `components/ExternalLink.tsx` + `StyledText.tsx`. `npx tsc --noEmit` exits 0, no errors. **Pattern**: query hooks at `hooks/useStudentMe.ts`; shared attendance constants at `lib/attendance.ts`; all dates stored/queried as AD, converted to BS at display via `bs-calendar`.
- [x] Teacher Backend A (Session 26) — 5 self-scoped read endpoints (no id params, all resolve from token): `GET /timetable/my` (delegates to getTeacherTimetable; timetable_slots.teacher_id = users.id confirmed), `GET /timetable/my/sections` (DISTINCT union: sections.class_teacher_id OR timetable_slots.teacher_id, deduplicated), `GET /attendance/staff/my/summary` (mirrors staff summary endpoint, TEACHER_AND_ABOVE), `GET /attendance/staff/my` (history, forces userId from token), `GET /hr/staff/me` (resolves staff_profiles by user_id). Write accountability already present: student_attendance.marked_by and marks.entered_by both exist and are set from user.userId — no migration needed. Soft-scope policy confirmed: bulkMark and bulkEnterMarks are permissive (no section/subject assignment check), cross-section writes allowed and recorded. 12 new tests — 251 total passing.

- [x] BILL-8 — bill/receipt printing (`docs/api-contracts/BILL-8-SPEC.md`, `apps/api/src/modules/finance/bill-pdf.*`,
  `bill-document.service.ts`, `bill-receipt*.ts`, `bill-print-*.ts`, `common/pdf/`) — three checkpoints, branch
  `feat/bill-8-printing` (#39). **B8-1 reversed at Checkpoint A discovery, before any rendering code was written**
  (`BILL-BUGS.md`): pdfkit, not headless Chromium — the deploy VPS (KVM 1, 1 vCPU/4GB, already flagged tight for
  5 containers) made a new Chromium dependency + shared-browser-instance pattern a real OOM risk for zero benefit,
  since pdfkit already existed (report cards) with a working Devanagari font path. `common/pdf/` extracted as a
  shared module (font-loading + `pickFont` script detection, behavior-preserving refactor of `examination/
  pdf.service.ts`) so `bill-pdf.service.ts` reuses it verbatim. **Checkpoint A**: A4 bill layout (pdfkit,
  per-tenant `brandColor` accent, `Money.toDisplay` lakh-style thousands separators), `BillDocumentService`
  orchestration + endpoint. **Checkpoint B**: bilingual EN/NE/BOTH + thermal receipt layout +
  `NEPALI_PRINT_REVIEWED` gate (a native-speaker review must open it before NE/BOTH ship — matches I18N-1's
  review-gate precedent). Two real findings fixed at the root during the visual review pass (full detail in
  `BILL-BUGS.md`): mixed-script tofu on the "For: {School}" signature line (`pickFont()` was picking one font for
  a concatenated label+dynamic-value string; new `drawMixedText` helper draws each run with its own font — 4
  instances of the bug class found and fixed, not just the reported one) and `amount_in_words` fed `netAmount`
  instead of `totalReceivable` (BILL-4-era bug, invisible until BILL-8 first rendered it; fixed at render time
  from the invoice's own frozen `total_receivable`, retroactively correct for all already-posted invoices without
  mutating immutable rows). **Checkpoint C**: bulk-print background job (run-scoped + class-scoped), poller-driven
  like every other async job in this module. **Known open item**: `FIX-STORAGE-URL` — `StorageService`'s public-URL
  builder double-appends the bucket when `S3_PUBLIC_URL` is already bucket-qualified (the documented `.env`
  convention always is) — real bug, confirmed live, ruled out-of-scope for BILL-8, still open in `BILL-BUGS.md`.

- [x] BILL-9 — read-only reporting + cashier daily-close (`docs/api-contracts/BILL-9-SPEC.md`,
  `apps/api/migrations/tenant/0028_cashier_shifts.sql`, `apps/api/src/modules/finance/cashier*.ts`) — two
  checkpoints (#42, #43). **Checkpoint A** (daybook, defaulters, aging, collection, statement): spec named these
  at `GET /finance/reports/*`, but two of those paths collided with already-live old-rail routes
  (`FinanceController`'s pre-BILL-4 `report.service.ts`, still backing shipped pages) — raised before writing
  code, three options offered, Srijan's ruling was to mount all four under the pre-existing REP-1
  `ReportsController` instead (`GET /reports/finance/daybook|defaulters|collection|aging`), zero collision, zero
  regression risk (`BILL-BUGS.md` "BILL-9-CKPTA-DEVIATION-1"). Student statement stayed in the finance module as
  spec'd (`GET /finance/students/:studentId/statement`, extends BILL-3's ledger endpoint with opening/closing
  framing). **Checkpoint B**: cashier daily-close (`cashier_shifts`, open/close-shift with expected-vs-counted cash
  reconciliation, `CashierController`). **Checkpoint C (printable export) deliberately skipped, closing BILL-9 at
  B** — a locked "only if requested" gate per the spec, Srijan's call after Checkpoint B: the five JSON report
  endpoints plus cashier close are enough for v1; BILL-8's pdfkit path is proven and reusable directly whenever a
  printable report is actually asked for (`BILL-BUGS.md` "BILL-9-EXPORT"). *(CLAUDE.md drift note, added
  2026-08-01: this bullet and the one above were reconciled from git history after being found missing from this
  file on `main` — the underlying code, migrations, and module wiring were confirmed already live and tested; see
  the `FIX-CLAUDEMD-DRIFT` commit.)*

**Dev notes:**
- Prisma schema lives in `apps/api/prisma/` (not `packages/database/`) — pragmatic fix
  for a non-workspace monorepo; avoids Prisma generator output-location conflicts
- DB: PostgreSQL 17 local (password: <DB_PASSWORD — see .env>). Redis not running yet (needed for queues)
- Super Admin: AppModule.configure() registers TenantMiddleware with exclude for /api/v1/super-admin/(.*) AND /api/v1/tenants/verify/(.*). TenantModule no longer implements NestModule — middleware wired in AppModule only.
- Bootstrap a platform super-admin (public `platform_admins` — NOT created by `seed`/`seed:demo`;
  a fresh DB has none): `cd apps/api && npm run seed:admin -- <email> <password> [firstName] [lastName]`
  (`src/prisma/seed-admin.ts`). Idempotent — re-running an existing email resets that admin's
  password + re-activates (name left unchanged), so it doubles as a forgotten-password reset.
  Login at `{WEB_BASE_URL}/super-admin/login`. PowerShell: single-quote the password. Verified
  live (create → bcrypt `$2b$12$` → idempotent reset → bcrypt.compare true → row cleaned).
- Run migrations (public schema, Prisma): `cd apps/api && npx prisma migrate dev`
- Tenant schema migrations (MIG-1): tenant schemas are NOT Prisma-managed. Add SQL to
  `apps/api/migrations/tenant/NNNN_desc.sql` (reference the schema only via `{{schema}}`),
  then run `npm run migrate:tenants` (all) / `-- --tenant <slug>` (canary) / `-- --dry-run`
  / `-- --status`. Ledger `_tenant_migrations` lives in each tenant schema; applied files are
  immutable (checksum-guarded); no down migrations (recovery = restore-from-backup).
  **Canary convention:** always apply to the `demo` school first, verify, then roll to all.
  Provisioning (`register-school`) now runs the runner from `0001_baseline.sql` instead of
  the retired `tenant-schema.sql`. See `apps/api/migrations/tenant/README.md`.
- MIG-3 (guardian dedup, `0003_dedup_guardians.sql`): removed motherland's backfill
  triplicates (151→51 rows; survivor rule prefers the `user_id`-linked row so parent logins
  survive; DO-block invariant aborts if a dup group holds two distinct user_ids). NO unique
  constraint on `(student_id, phone)` by design — father and mother can share a phone; dup
  prevention lives in the write path (GuardianService). The runner's `splitStatements` is now
  **dollar-quote aware** ($$…$$ / $tag$…$tag$ bodies stay one statement), so migrations may
  use DO blocks — but keep dollar-quoted bodies free of `--` comment lines (still stripped).
  Migration files are LF-pinned via root `.gitattributes` (ledger checksums are byte-checksums).
- **FIX-2 (resolved):** BS→AD conversion is TZ-independent — `formatLocalDate()` in
  `modules/common/utils/date.util.ts` formats locally-constructed Dates (bsToAd output, fiscal
  boundaries, seeds) from their own local components instead of `toISOString()` (which shifted
  the day back under UTC+ zones). **The full suite passes under BOTH `TZ=Asia/Kathmandu` and
  `TZ=UTC`.** The CI + Docker TZ pins stay (platform convention, independent of this bug).
  Rules: local-frame Dates → `formatLocalDate`; DB-sourced DATE values → existing
  `toISOString()` round-trip is correct (UTC-frame consistent); timestamps → `toISOString()`.
  Known remainder (deliberate, separate pass if wanted): ~11 sites compute "today" as UTC-today
  (`new Date().toISOString().split('T')[0]`) — TZ-stable but Nepal-semantically early by 5h45m
  each night (dashboard/report/invoice/staff/issue/attendance).
- **FIX-3 (open, 2083 instance HOTFIXED 2026-07-22, broader 2000-2080 audit still queued):** the
  bs-calendar `BS_MONTH_DATA` table is **one day off in the 2070 era** (authoritative: 1 Baisakh
  2070 = 2013-04-14, 15 Bhadra 2070 = 2013-08-31; table yields one day earlier — verified vs
  nepalicalendar.rat32.com 2026-07-11). Epoch constant (`new Date(1943, 3, 12)`) also contradicts
  the package's own "13 April 1943" docstring. **"Modern era is CORRECT" (the previous claim here)
  was WRONG** — the current year was not actually safe either. Found during WEB-P Phase 0.5's
  bs-calendar de-fork (separate branch) via live cross-check against three sources
  (nepalicalendar.rat32.com, nepalicalendar.online, hamropatro.com): `2083`'s row had **Ashadh and
  Shrawan transposed** (table had Ashadh=31/Shrawan=32; correct is Ashadh=32/Shrawan=31 — their sum,
  63, was already right in the buggy table, only the distribution between the two months was
  wrong, which is exactly why a first attempt fixing only Ashadh got Bhadra-onward newly wrong and
  needed a second round of live verification — five month-boundaries checked, including a
  Node-`Date`-computed weekday cross-check to catch an AI-fetch source-mislabeling artifact — before
  the full picture was confirmed). **This specific 2083 value is now fixed** (hotfix branch
  `hotfix/bs-2083-ashadh-days`, off `main`, independent of WEB-P): `packages/bs-calendar/src/data.ts`
  and `apps/web/lib/bs-calendar/data.ts` (still a separate file on `main` — WEB-P's de-fork hasn't
  merged) both corrected in lockstep, `apps/mobile` picks it up via its existing
  `file:../../packages/bs-calendar` dependency once rebuilt. **Two independent instances of a
  second, previously-invisible bug were found and fixed in the same pass:** neither
  `packages/bs-calendar/jest.config.js` nor `apps/api/package.json`'s jest config overrode
  `moduleFileExtensions`, so Jest's `.js`-before-`.ts` default meant both packages' test suites were
  silently resolving `data.ts`'s already-committed, stale, uncorrected `.js` build artifact instead
  of the real TypeScript source — invisible for the package's entire history because no prior test
  touched a value where the two ever diverged; this fix was the first one that did. Both reordered
  to prefer `.ts` (stale `.js` files themselves left untouched — a separate, still-open cleanup
  item). `apps/api`'s 3 tests hardcoding the old boundary were individually recomputed from actual
  source logic (not a uniform day-shift assumption — the affected AD window turned out to be
  narrowly `2026-07-16` through `2026-08-16` only; a `date.util.spec.ts` Poush-17 assertion that
  looked like it should change was verified to NOT need changing, since Poush's cumulative offset is
  identical under both the buggy and corrected tables). Full apps/api suite (665/665) and
  bs-calendar suite (36/36) both green. **Broader fix (auditing the rest of 2000-2080) remains
  open** — this hotfix deliberately did not attempt it; the 2070-era vectors in `date.util.spec.ts`
  still deliberately key to the current (still-unaudited-elsewhere) table and must be updated
  whenever that fuller audit lands.
- Run tests: `cd apps/api && npm test`
- OPS-1 (operations hardening): `GET /health` at ROOT path (no api/v1 prefix, no tenant, no
  throttle) — `ok|degraded|error`, 503 only when db down; redis down = degraded (app runs
  without Redis). Sentry via `src/instrument.ts` (SENTRY_DSN optional; scrubbed; captures only
  non-HTTP errors in HttpExceptionFilter). Request logging: LoggingInterceptor JSON lines
  (reqId/method/path/status/ms/tenant/userId; never bodies or auth headers; /health excluded);
  ConsoleLogger json:true in production. Fine cron: `@nestjs/schedule` `'5 0 * * *'`
  Asia/Kathmandu in `src/jobs/` (BullMQ REMOVED — the old job was quadruple-dead: Redis-gated
  module, silent BullMQ buffering, snake_case SQL against the camelCase public schema, and a
  status='ACTIVE' filter matching zero tenants). Manual trigger:
  `POST /super-admin/jobs/recalculate-fines` (PLATFORM_ADMIN). NOTE: recalculateFine skips
  invoices whose items have fine_per_day=0 — stale nonzero fines are never zeroed (pre-existing,
  out of OPS-1 scope). Backups: `scripts/backup-db.sh` (pg_dump -Fc) + `docs/ops/RUNBOOK.md`
  (restore IS the rollback). Platform-admin password: rotated 2026-07-11 (G1 closed, 401
  proven); change-password is now a real feature (MAIL-1) — super-admin settings page + POST
  /super-admin/auth/change-password.
- MAIL-1 (email + password reset, 2026-07-11): `modules/mail/` — MailService (SMTP via Joi-
  registered SMTP_*/MAIL_* env vars, ALL optional: disabled = MOCK + boot notice; MAIL_ETHEREAL=true
  = dev test inbox with logged preview URLs), CredentialMailer (HTML-escaped templates),
  `email_log` table (PUBLIC schema, Prisma migration, nullable tenant_id, no bodies/passwords
  stored). Fire-and-forget: services emit MAIL_EVENTS via EventEmitter2; MailListener sends off
  the request path. Credential delivery: student/guardian/staff/owner provisioning with password
  OMITTED → temp password generated (`modules/mail/password.util.ts`) + emailed; resend endpoints
  (throttled 5/h, revoke sessions). Password reset: tenant migration 0004_password_reset_tokens
  (hashed tokens, 30-min, single-use via atomic claim); POST /auth/forgot-password (3/h/IP,
  oracle-free) + /auth/reset-password + /auth/change-password; web pages /forgot-password +
  /reset-password (tenant via ?tenant= in the email link) + ChangePasswordCard on both settings
  shells. GOTCHA: public-schema `tenants.id`/`subscriptions` columns are TEXT + camelCase (Prisma-
  managed) — never `::uuid`-cast or snake_case them in raw SQL (bit both MIG-3's cron fix and
  MAIL-1's resolveSchool). Backlog: force-change-on-first-login for emailed temp passwords
  (change-password exists; forcing it is a future nicety — MAIL-1 R2).
  App connects as postgres SUPERUSER in dev — prod must use a non-superuser role (runbook).

- [x] eSewa online fee payment (PAY-1, `apps/api/src/modules/finance/esewa/`) — ePay v2 (contract verified against developer.esewa.com.np 2026-07-11): tenant migration `0005_payment_transactions` (audit-trail table, NO deleted_at by design); `POST /finance/payments/esewa/initiate` (PARENT object-scoped + staff; amount = server-computed outstanding balance, client sends only invoiceId); public browser routes under `/finance/payments/esewa/public/` (pay page, success/failure callbacks, receipt — tenant slug in path, excluded from TenantMiddleware like /tenants/verify); **trust model: redirect `?data=` is a stored hint only — money is recognized solely after a server-to-server status-check returns COMPLETE with amount matching to the paisa; INITIATED→VERIFIED is a conditional UPDATE sharing one DB tx with `PaymentService.recordPaymentInTx` (extracted from recordPayment, behavior identical) → exactly-once credit**; NOT_FOUND past 15-min grace → EXPIRED (late COMPLETE still credits once); pay page ships its own per-response CSP (nonce'd script + form-action to eSewa origin — helmet's global default blocks both inline JS and cross-origin form POST; do NOT weaken helmet globally); **eSewa pay URLs are single-shot** (first form-POST registers the uuid; re-POST → "Duplicate transaction UUID" — retry = new initiate); web `/payment/success|failure` result pages (public receipt lookup, no PII; proxy.ts PUBLIC_PATHS fix also unblocked logged-out /forgot-password + /reset-password); mobile parent fees screen "Pay with eSewa" button (Linking.openURL system browser, AppState refetch on refocus, pay URL derived from the app's own API base); runbook section (go-live env swap + reconciliation queries) — 23 new unit tests (352 total passing)

- [x] Push delivery pipeline + notification inbox (PUSH-1) — **backend:** `PushService`
  (`modules/communication/push.service.ts`, expo-server-sdk v6: ESM-only → runtime loads via
  Node 24 require(esm); jest maps it to `src/testing/expo-server-sdk.jest.ts`) resolves
  device_tokens per user, sends in chunks, prunes `DeviceNotRegistered` at ticket AND receipt
  level (receipts polled 30s after send; every prune logged); **NEW bus events** (flagged per R1):
  `result.published` (ExamTypeService.setPublished, only on unpublished→published edge) and
  `notice.posted` (NoticeService.publishNotice, first publish only — re-publish never re-notifies).
  **Mirror rule everywhere:** listener creates the in-app `notifications` row(s) FIRST
  (createNotification now returns id; createNotificationsBulk for fan-outs), then pushes with
  `data: { route, notificationId }`. AttendanceListener resolves per-student audience from
  normalized guardians→users (object-scoped; also fixed dormant bug: the emit only carries
  studentId, the old listener expected parentPhone → absent SMS never sent). NoticeListener
  audience mirrors ROLE_AUDIENCES list visibility; CLASS → that class's students + their parents
  (list visibility for CLASS to students/parents is a pre-existing gap, see backlog).
  **Mobile:** `lib/notifications.ts` (ALL expo-notifications access via guarded dynamic import —
  static import crashes Expo Go SDK 53+; registration now sends required `platform` field — the
  old login.tsx payload silently 400'd), `PushBootstrap` in root layout (foreground banner,
  tap → role-scoped route map `routeForPush`, cold-start tap replay-guarded), `HeaderBell`
  (live unread count, replaces all three hardcoded dots; teacher bell previously mis-routed to
  profile), shared `NotificationInbox` + hidden `inbox` routes in all three role apps
  (mark-read on open, mark-all-read, BS-aware timestamps), teacher notices screen (reuses
  NoticeFeed; entry: teacher Profile → School notices), logout now sends expoPushToken (R3).
  `EXPO_PUBLIC_PROJECT_ID` documented in apps/mobile/.env — 377 unit tests passing.

- [x] Khalti online fee payment (PAY-2, `apps/api/src/modules/finance/khalti/`) — KPG-2/ePayment
  (contract verified against docs.khalti.com 2026-07-12): same `payment_transactions` table
  (gateway VARCHAR unconstrained — NO migration), same four invariants and result pages as PAY-1.
  Structural difference honored: initiation is a **server-to-server POST** (`Authorization: Key …`)
  returning a hosted `payment_url` — no signed client form, no CSP carve-out; the public pay page
  is a plain 302. **Amounts are integer PAISA on the wire** (`khalti.util.ts` toPaisa/paisaToRupees,
  own spec with the 19.99-float-trap vectors; a Completed lookup with mismatched paisa FAILS and
  never credits). Our `transaction_uuid` = Khalti's `purchase_order_id`; `pidx` in `gateway_ref`;
  ONE `return_url` callback (no success/failure pair) → mandatory `/epayment/lookup/` →
  Completed→creditOnce via the shared `recordPaymentInTx` rail; Pending/Initiated→PENDING,
  Expired→EXPIRED (late Completed still claims once), User canceled/Refunded→FAILED.
  `GET /finance/payment-gateways` (enabled map; NOT under payments/ — FinanceController's
  `payments/:id` would shadow it) drives the mobile `PayChooser` (two-option when
  both gateways on, single otherwise, hidden when none — render-proven in
  `apps/mobile/__tests__/PayChooser.test.js`, the first mobile jest test); web result pages are
  gateway-aware via `?gw=` + receipt.gateway. Sandbox key requires merchant signup at
  test-admin.khalti.com (NO shared public test key; payer creds 9800000000-5 / MPIN 1111 /
  OTP 987654) — live sandbox proofs pend that key. 404 api tests passing.

- [x] POL-1 polish sweep (api + web, `docs/api-contracts/POL-1-api-web-polish.md`) — seven
  independent fixes, each Step-0-confirmed live before touching:
  **T1** `POST /finance/fee-structures` rejected `dueDate` (Postgres 42804: DATE column, text
  param) — added `$5::date` cast in BOTH the create and updateItems INSERTs (fee-structure.service.ts);
  also `dueDayOfMonth ?? null` for the SMALLINT. `dueDayOfMonth` workaround still works. Live 201 +
  SELECT read-back; regression tests.
  **T2** `GET /guardians/me` (PARENT, self-scoped, `guardian.controller.ts` + `GuardianService.getMyProfile`)
  — name/relation/phone/email (guardian row primary-preferred, falls back to users row) + linked
  children summary; resolves ONLY from token.userId → guardians.user_id (no id param), same
  discipline as /students/me. POL-2 mobile consumes it (kills the `nameFromEmail` synth).
  **T3** parent report-card PDF: the existing `GET /exams/results/report-card/:studentId/pdf` ALREADY
  allowed PARENT (buildReportCardPdf → getReportCard hard-scope via `assertGuardianOwnsStudent`);
  Step 0 found it present, so T3 = adversarial coverage — added the cross-family 403 PDF probe test.
  Live: own-child PDF 200 + `%PDF-1.3` magic bytes; another family's child → 403.
  **T4** force-change-temp-password-on-first-login (MAIL-1 R2): tenant migration **0006_must_change_password**
  (`users.must_change_password BOOLEAN NOT NULL DEFAULT false`) applied canary(demo)→all-6 via the
  runner (identical checksums verified). Flag set TRUE at every generated-temp-password site
  (provisioning: guardian/student/staff/owner INSERTs pass `generated`; every resend UPDATE sets
  true); cleared by change-password AND reset-password (`must_change_password = false`). login + /auth/me
  responses carry `mustChangePassword`. WEB: login routes flagged users to `/change-password`
  (new page in the **(auth)** group so the school shell — which redirects flagged users there —
  can't loop); school-shell effect enforces it; the page's change → clears flag → logout →
  re-login. The flag never blocks change-password/logout (proven: logout HTTP 200 while flagged).
  Live browser proof: temp login → redirect + amber banner → change → SELECT flag `f` → normal
  nav to /dashboard.
  **T5** defaulter CSV export: replaced the `console.log` stub with a real client-side CSV
  (`exportToCsv`, BS dates as displayed). **Found + fixed a pre-existing crash**: `useDefaulters`
  returned the whole `DefaulterReport` object but every consumer treated it as the student array —
  `defaulters.map` threw on ANY tenant with defaulters (the defaulters tab AND the finance overview
  were both dead). Fix = unwrap `.students` in the hook queryFn (matches the `DefaulterStudent[]`
  contract). Live: 9 motherland defaulters render + CSV downloaded (rows pasted in the PR).
  **T6** grading-scale CRUD UI (`app/(school)/exams/grading-scales/page.tsx` + sidebar entry): list
  / create (name + threshold rows) / rename. **Thresholds are immutable by design** — computed
  grades derive from them, so editing bands under published results would disagree with issued
  report cards; the only edit is rename (`PATCH /exams/grading-scales/:id` → new `GradingScaleService.rename`,
  `UpdateGradingScaleDto`). Radix computed-span convention followed. Live UI: POST 201 create,
  GET :id 200 thresholds on expand, PATCH 200 rename.
  **T7** query error boundaries: shared `QueryErrorState` (role="alert", message + Try-again→refetch)
  wired into the highest-traffic list pages (students/finance/attendance/exams) via `isError` +
  `refetch`, plus a route-level `app/(school)/error.tsx` (Next 16 `unstable_retry` preferred over
  `reset`). Live: killed the API mid-session → students page shows the error state (not blank);
  the route boundary independently caught the T5 defaulters crash before it was fixed.
  Suites: **415 api tests** (was 404; +11 across fee-structure/guardian/result/auth/grading-scale),
  web `tsc` clean. Backlog cleared: MAIL-1 R2 (force-change) is now DONE.

- [x] POL-2 mobile polish sweep (`apps/mobile`, `docs/api-contracts/POL-2-mobile-polish.md`) —
  consumes POL-1's endpoints (PR #1 merged to main first). Six items, each Step-0-confirmed:
  **T1** parent weekly timetable was built but unreachable (`href: null`, no entry) — added a
  "Full routine →" link on the parent dashboard's *Today's classes* header → `/(parent)/timetable`.
  **T2** student timetable was today-only — rewrote to a **Sun–Fri weekly** day-selector grid
  (reuses the parent day-selector UX + the shared `/timetable/section/:id` endpoint, STUDENT-allowed).
  Needed one additive api change: `sectionId` exposed on `GET /students/me` currentEnrollment
  (service already had it in scope; existing test assertion updated — **api stays 415, no new
  endpoint**). New `useMyWeeklyTimetable(sectionId)` hook mirrors `useChildTimetable`.
  **T3** removed the two orphan "Coming in Session 21" stubs (`app/(parent)/home.tsx` +
  `app/(teacher)/home.tsx`) and their `href:null` layout registrations — **spec said "three" but
  reality had two** (student home was already deleted in Session 22; inboxes already exist post-PUSH-1
  so there was no notifications stub to convert). `grep "Session 21"` = 0.
  **T4** parent results PDF — added the download button to `app/(parent)/results.tsx`; the shared
  `useReportCardDownload(childId)` hook already routes to the parent-scoped endpoint + handles 403/409.
  **T5** guardian real name — new `useGuardianProfile()` (`GET /guardians/me`) + shared
  `lib/guardian.ts` (`guardianDisplayName`, email-synth kept only as loading fallback); wired into
  parent index/profile/profile-details (also surfaces the guardian phone now that /guardians/me
  provides it). **T6** must_change_password on mobile — login response flag → `store/auth.ts`
  transient `mustChangePassword` → root `_layout.tsx` routes flagged sessions to a new
  `app/change-password.tsx` (temp-password → change → revokes tokens → sign out → re-login);
  "Sign out instead" always available. Cleared by change-password (server) + `clearMustChangePassword`.
  **GOTCHA:** `expo-router` typed routes live in gitignored `.expo/types/router.d.ts` (regenerated
  by `expo start`); a new route file makes LOCAL `tsc` fail until regenerated (CI has no such file →
  permissive). Regenerate via a brief `npx expo start --offline` if local tsc rejects a new route.
  Proofs (raw, mobile-shaped `X-Client-Type: mobile`): T5 /guardians/me → real "Dipak Sharma";
  T4 own-child PDF `%PDF-` 200 + cross-family 403; T2 /students/me returns sectionId + section
  endpoint returns Sun–Thu weekly; T6 mobile login `mustChangePassword:true` → change → DB flag `f`
  → new-password re-login `false`. **Mobile jest 19 (was 10, +9 guardian helper), mobile tsc clean,
  api 415 unchanged.** Shimmed student.demo password restored with read-back.

- [x] Real file storage — S3-compatible presigned uploads (FILE-1, `docs/api-contracts/FILE-1-file-storage.md`,
  `apps/api/src/modules/storage/`) — kills audit P1-13 (base64 in 5MB JSON bodies). **StorageService**
  (@aws-sdk/client-s3 + presigner; `requestChecksumCalculation: 'WHEN_REQUIRED'` — the SDK default embeds
  an empty-body CRC32 in presigned URLs that real AWS would reject, MinIO merely ignores) + kind-policy
  table (`storage.policy.ts`: student-photo/staff-photo/school-logo/principal-signature/school-stamp/
  staff-document — per-kind max bytes, content-type→extension map, uploadRoles, publicRead). Keys are
  ALWAYS server-generated `tenant_<slug>/<kind>/<uuid>.<ext>` (client "key" stripped by whitelist pipe —
  raw-proven). `POST /files/presign-upload` (per-kind role narrowing) + `GET /files/presigned?key=`
  (query param, not :key — keys contain slashes) with object-level scoping in `FileAccessService`:
  row-reference required (unreferenced keys 404 for everyone), PARENT via guardians link (cross-family
  403 raw-proven), STUDENT via students.user_id, staff-document owner-or-manager, cross-tenant keys 404.
  **Confirm flow:** feature endpoints take `photoFileKey`/`fileKey`/`logoFileKey`/`principalSignatureFileKey`/
  `schoolStampFileKey` alongside legacy base64 (deprecated, `[FILE-1]`-logged) → `verifyConfirmedKey`
  (shape+tenant+kind+HEAD+size/type) → KEY stored in the column. **school-logo is the ONE public-read kind**
  (pre-auth consumers) — bucket policy `tenant_*/school-logo/*` GetObject, column stores the PUBLIC URL,
  brand-color extraction now reads bytes from storage (`getObjectBuffer`), rederive untouched. FIXED in
  passing: admitStudent INSERT had no photo_url — admission photos were silently dropped. Web:
  `lib/upload.ts` presign→PUT→key with base64 fallback ONLY on 503 (disabled mode keeps working),
  `useFileUrl`/`StorageAvatarImage`/`FileDownloadLink` resolve stored keys (4-min staleTime vs 5-min URLs);
  all 7 upload sites cut over (super-admin logo presigns with explicit `X-Tenant-Slug` of the target school).
  Mobile: display-only — `hooks/useFileUrl.ts` + 4 profile screens. Orphans: `npm run prune-orphans`
  (dry-run DEFAULT, `--delete`, `--grace-hours`, 24h grace) — no cron by design. MinIO dev setup + provider
  swap table + logo-URL rewrite SQL + "object storage is OUTSIDE pg_dump" in RUNBOOK. Live proofs: full
  round-trip byte-identical (cmp exit 0), oversize/bad-type/unknown-kind 400s, logo → `#12d989` derived
  server-side + anon public fetch 200, disabled-mode 503 + boot WARN + legacy base64 200 + deprecation log,
  orphan dry-run→delete with read-backs; ALL probe data cleaned (bucket 0 objects, hashes restored, shim 401s).
  **450 api tests (was 415, +35), web tsc clean, mobile jest 19 + tsc clean.** Storage census at cutover:
  5 legacy base64 blobs (motherland ×4, jorden-donovan logo) — migration is a follow-up; body-limit shrink
  to ~1MB once `[FILE-1]` logs go quiet (runbook).

- [x] Assignments & homework (EDU-1, `docs/api-contracts/EDU-1-assignments-api-web.md`,
  `apps/api/src/modules/assignment/`) — Phase B's first module; api + web (mobile = EDU-2). Tenant
  migration **0007** (assignments + assignment_submissions, UNIQUE (assignment_id, student_id)),
  canary demo→all-6, identical checksums. **Late rule:** `assignment.util.ts` `endOfDayInNepal` /
  `computeSubmissionStatus` — LATE strictly after due-date 23:59:59.999 **Asia/Kathmandu** (offset
  arithmetic, NEPAL_OFFSET_MS pattern; boundary unit-tested both sides ±1ms; a 20:00Z same-UTC-date
  submission is correctly LATE). **Scoping split:** teacher/admin writes soft-scoped with
  accountability (any TEACHER may post to any class, created_by stamped — ASSIGNMENT_MANAGER_ROLES);
  student/parent HARD-scoped via the /me discipline (`GET /assignments/me`, submit eligibility =
  PUBLISHED + class match + (section match OR whole-class); `GET /assignments/my-children` via
  guardians). **Events (edge-only, PUSH-1 rule):** `assignment.published` fires ONLY on the
  DRAFT→PUBLISHED conditional UPDATE (re-publish 409s, live-proven no re-emit); `submission.reviewed`
  only on the →REVIEWED transition (re-review updates marks silently, live-proven). AssignmentListener
  (communication/listeners) mirrors NoticeListener: in-app rows first (`createNotificationsBulk`,
  type ASSIGNMENT, route `assignments`), then push; audience = targeted section's (or class's) ACTIVE
  students with accounts + their guardians' PARENT users — live-proven exactly {student, parent}, 0
  rows outside the audience. **FILE-1 kinds added:** `assignment-attachment` (teacher, +TEACHER in
  UPLOADER_ROLES, images+pdf+doc/docx 10MB) and `submission-file` (STUDENT) with NEW `scopedOnly`
  policy flag — the generic /files/presign-upload REJECTS scopedOnly kinds; presign lives at
  `POST /assignments/:id/submissions/presign-upload` AFTER the eligibility check (probed live:
  generic route 403, assignment route 200). Resubmission UPDATEs the unique row (no history) but
  409s after REVIEWED (never silently erases a review — design decision). Missing list = enrolled
  ACTIVE minus submitters (NOT EXISTS; live: 8−1=7 with names). Web: `/assignments` list
  (class/section/subject/status filters via useClassSubjects) + create dialog (BsDateInput, FILE-1
  attachment upload, max 5×10MB) + `[id]` detail (publish/close, submissions table with
  SUBMITTED/LATE/REVIEWED badges, FileDownloadLink for files, review dialog, missing chips);
  sidebar entry + ROUTE_ACCESS `/assignments` = TEACHER_TIER citing `POST /assignments` (SEC-2
  parity). Static `me`/`my-children` routes declared BEFORE `:id` (route-shadow lesson). Full live
  proof chain on demo (Grade 9 A) incl. LATE/SUBMITTED at the boundary, wrong-section 403, parent
  200 + staff/student-route 403s, review→2 notification rows, all probe rows/objects cleaned with
  read-backs, shimmed passwords restored (401-proven). **485 api tests (was 450, +35: util 6,
  submission 17, assignment 8, storage +4), web tsc clean.**

- [x] Assignments mobile (EDU-2, `docs/api-contracts/EDU-2-assignments-mobile.md`) — all three role
  apps consume EDU-1's API; **api untouched (485, zero diff under apps/api)**. **Mobile's FIRST
  upload path:** `lib/submissionUpload.ts` — expo-document-picker (newly installed, ~56.0.4) →
  client-side policy pre-check (`validatePickedFile` mirrors the submission-file kind policy) →
  the ASSIGNMENT-scoped presign (`POST /assignments/:id/submissions/presign-upload` — the generic
  /files route 403s students by design) → `FileSystem.uploadAsync` raw PUT from
  **`expo-file-system/legacy`** (established pattern: legacy has status codes + exact signed
  headers) → confirm with fileKey. Student: `(student)/assignments` list (To submit / Submitted
  sections, OPEN/OVERDUE/SUBMITTED/LATE/REVIEWED chips via `lib/assignmentStatus.ts` — semantic
  literals like STATUS_CONFIG; `isPastDue` is display-only, the server's Kathmandu EOD rule is
  authoritative) + `assignment-detail` (teacher attachments via useFileUrl→Linking, submit/resubmit
  form, after-review + closed states surfaced as honest locked notes, 409 alert branch titled
  "Submission locked" not an error); detail derives the assignment from the /me list cache (no
  student-scoped GET /assignments/:id exists — staff-only). Parent: `(parent)/assignments`
  (SelectChip child switcher, per-child statuses + marks/feedback, Homework quick tile). Teacher:
  `(teacher)/assignments` (class-filter chips derived from the list; creation stays web-only) +
  `assignment-detail` (submissions with inline review form matching web semantics, missing-list
  chips; home entry button). Push route map: `assignments` added to all three roles in
  `routeForPush` (one edit covers push-tap + inbox-tap). Screens registered as `href:null` hidden
  routes; student/parent entries via Quick-access tiles. Live proofs mobile-shaped
  (X-Client-Type: mobile): /me list excludes the section-B craft; presign→raw PUT→confirm
  SUBMITTED with fileKey; due-yesterday LATE; missing 8−1=7; review → student sees marks 9 +
  feedback + notification rows route=assignments; after-review resubmit raw 409; parent view
  leaked nothing cross-section; probes cleaned with read-backs, shims 401-proven dead.
  **Mobile jest 34 (was 19, +15: assignmentStatus 6, submissionUpload 9), mobile tsc clean**
  (typed-routes regen via brief `expo start` per the POL-2 gotcha).

- [x] Reports module — cross-module analytics (REP-1, `docs/api-contracts/REP-1-reports.md`,
  `apps/api/src/modules/reports/` + `apps/web/app/(school)/reports/`) — **read-only, ZERO
  migrations** (still 7 tenant migrations; pure aggregation over existing data). Three report
  families: **attendance** (`GET /reports/attendance/trends` day|bs-month buckets + class-comparison
  + `/low` below-threshold list + `/staff` summary), **exams** (`/reports/exams/summary/:id` per-subject
  avg/hi/lo/pass-rate + grade distribution, `/comparison/:id`, `/student-progress/:id`, `/published`),
  **fee aging** (`/reports/finance/aging` 0-30/31-60/61-90/90+ buckets vs asOf, per-class + drill-down).
  **BS-month bucketing** (`report.util.ts` `bsMonthBucket`): SQL aggregates per AD day (index-aligned),
  the service folds day-rows into BS months via bs-calendar — NO SQL-side BS math (Step-0-verified
  at build time against the then-current table: 1 Shrawan 2083 = 2026-07-16 boundary; year boundary
  1 Baisakh 2083 = 2026-04-14; FIX-3 2070-era caveat noted but operational data assumed current-era
  safe. **That assumption was wrong** — the 2083 boundary itself was later found buggy and hotfixed
  to `1 Shrawan 2083 = 2026-07-17`; see the FIX-3 entry above. REP-1's own crafted-fixture tests
  were unaffected by the hotfix, per that entry.) **Publish boundary** = privacy gate: only
  exam_types with results_published_at NOT NULL are visible (unpublished == 404, indistinguishable).
  **Roles** (spec-fixed): attendance+exams → PRINCIPAL_AND_ABOVE+ACADEMIC_COORDINATOR; aging adds
  ACCOUNTANT. **Bounded ranges** everywhere (`resolveRange`: default current BS year, 2yr cap) — no
  unbounded scans. **Aging semantics** reconcile with the existing defaulters report (same
  balance>0 population; aging adds the time dimension; web links to defaulters, doesn't duplicate).
  Web `/reports`: 3 tabs (Attendance/Exams/Fees), recharts stacked bars (dashboard convention), BS
  pickers, per-view CSV (POL-1 `exportToCsv`), QueryErrorState, sidebar + ROUTE_ACCESS row (aging
  opens to ACCOUNTANT, attendance/exam tabs hidden in-page for them). Live proofs: 32-row crafted
  attendance fixture → BS-month split (Ashadh 11P/3A/1L/1Lv=75%, Shrawan 12P/3A/1L=81.3%) matched
  hand-computed EXACTLY; low-attendance roll-8=0% roll-7=25%; aging 30d→0-30(Rs1000) vs 31d→31-60
  (PARTIAL at remaining Rs600); publish before(empty/404)→after(15 students/26.7% pass); ACCOUNTANT
  aging 200 / exams 403 / attendance 403; **motherland timings 8-44ms all endpoints** (no index
  needed — well under 1s); web 3 tabs render via SPA-nav. All crafted rows cleaned with read-backs
  (attendance/invoices deleted, exam re-NULLed, 2 shim passwords restored + 401-proven).
  **511 api tests (was 485, +26: util 20, attendance/exam/aging service specs 6), web tsc clean.**

- [x] Android EAS build + first on-device push (EAS-1, `docs/mobile/EAS-1-android-build.md`,
  `apps/mobile/`) — EAS project `@aaramva-nepal-technology/aaramva-shikshya`
  (`EXPO_PUBLIC_PROJECT_ID` 54147e05-…); `eas.json` 3 profiles (development / **preview** installable
  APK, internal / production AAB, configured-unused). android package `com.aaramvashikshya.mobile`,
  v1.0.0 vc1. `google-services.json` committed (public ids only); FCM V1 service-account key uploaded
  to EAS creds then deleted locally (never committed). **The real find: the preview APK could not
  reach the LAN dev API at all** — Android 9+ blocks cleartext HTTP by default (expo-build-properties
  `usesCleartextTraffic` defaults false), so every `http://<lan-ip>:3001` request died on-device
  before hitting the server even though the device *browser* reached `/health` fine. Fix: added
  `expo-build-properties` via a dynamic **`app.config.ts`** that layers `usesCleartextTraffic:true`
  onto app.json **scoped to non-production only** (gated on `EAS_BUILD_PROFILE !== 'production'`) —
  dev + preview get cleartext, the prod AAB stays cleartext-free (HTTPS; clean Play data-safety
  posture). Verified via `expo config` for both profiles. **T5 on-device proof (preview APK, commit
  `ecc7ba9`, fingerprint `cfb0376d…`, on a real motorola edge 60 pro):** first real `device_tokens`
  row in platform history (ANDROID, `ExponentPushToken[…]`); absence (`POST /attendance/students/bulk`)
  → `attendance.absent` → parent push → tap → `/(parent)/attendance`; notice (audience PARENTS,
  publish) → `notice.posted` → parent push → tap → `/(parent)/notices`; Expo delivered (token
  survived, no `DeviceNotRegistered`). **Buzz gotcha (not a bug):** the foreground handler in
  `lib/notifications.ts` sets `shouldPlaySound:false` and the `default` channel importance is DEFAULT,
  so pushes buzz/sound only when the app is **backgrounded/closed** — silent in-foreground by design.
  **Dev-API LAN note:** preview env bakes `EXPO_PUBLIC_API_URL=http://<lan-ip>:3001/api/v1`; the API
  must bind 0.0.0.0 (it does) and the laptop Wi-Fi IP must stay put — an IP change requires a rebuild
  (or a router DHCP reservation). On Windows, node.exe already had inbound-Allow firewall rules
  (Public+Private) so no per-port rule was needed; the Wi-Fi was on the **Public** profile (a rule
  scoped to Private would silently not apply). T6 docs: RUNBOOK mobile build/release section +
  `docs/mobile/store-submission-checklist.md`. All crafted rows (absence/notice/notifications) + the
  device token cleaned with read-backs; parent+owner shim passwords byte-exact restored. **apps/api
  untouched (511); mobile jest 34, tsc clean.** iOS + store submission/listing out of scope.

- [x] Nepali language — mobile i18n (I18N-1, `docs/mobile/I18N-1-nepali-mobile.md`) — all three
  role apps + auth screens are bilingual (English + नेपाली). **i18next + react-i18next +
  expo-localization + AsyncStorage** (NOT hand-rolled — the engine is the library; only a thin
  locale store + useLocale hook + LanguageToggle + date helpers are ours). Per-app-area namespaces
  (`common`/`auth`/`student`/`parent`/`teacher`) at `apps/mobile/lib/i18n/locales/{en,np}/`; device
  default (`ne*`→np), locale persisted to AsyncStorage (preference, not secret → NOT secure-store),
  hydrated in the root layout before UI renders. **Language toggle** on the login screen + all three
  profiles (a parent who can't read English must find it without hunting). **Dates:** `BS_MONTH_NAMES_NP`
  finally earns its keep — BS dates render Nepali month names (२७ असार) when locale=np via
  `formatBs(bs, 'np')` / `lib/i18n/date.ts`; numerals stay Arabic (0–9) in v1 (Devanagari numerals
  ०–९ are a flagged future decision). **Font:** `NpText` auto-detects Devanagari → Noto Sans
  Devanagari; the sweep routes every translated `<Text>` through NpText, and shared primitives
  (StateViews/Badges/PrimaryButton/CardLabel/AttendanceSummaryCard/NoticeFeed/NotificationInbox/
  AttendanceCalendar/PayChooser) render text via NpText so np copy always uses the bundled font.
  Status/day/notice-type/fee/assignment-status labels carry a `labelKey` into the common namespace
  (screens render `t(cfg.labelKey)`); all dynamic values use interpolation (never string concat —
  Nepali word order differs), incl. i18next plurals. **HUMAN GATE (verification 4):** translations
  were presented to Srijan for native-speaker review (`docs/mobile/I18N-1-review-translations.md`,
  417 strings, two-column en→np); the session may NOT self-certify translation quality — Srijan said
  "keep i18next and continue the sweep" (no corrections), and the PR stays open for his final read
  before merge. Backend-originated strings (notification bodies, API errors, SMS/email) are OUT of
  scope — flagged for a future backend-i18n decision (I18N-2 web + backend). `jest.setup.ts` inits
  i18next(en) before component tests (t() renders real strings). **Mobile jest 45 (was 34, +11:
  i18n switch/plural/fallback/BS-date + locale-store persistence), mobile tsc clean, api 511
  UNCHANGED** (zero apps/api diff). GOTCHA: naming collision — screens that do `const t = todayBs()`
  clash with the translation `t`; rename the date var to `tbs`. Web i18n is out of scope (I18N-2).

- [x] Per-school web branding (BRAND-1, `docs/superpowers/specs/2026-07-16-web-school-branding-design.md`)
  — **the logo fix:** `sidebar.tsx` was the only `next/image` in the app with a dynamic src;
  FILE-1 turned school logos from base64 `data:` URIs (which next/image passes through
  unoptimized, never reaching the hostname check) into real storage URLs (which do), so the
  panel crashed for any school with a post-FILE-1 logo. Now a plain `<img>`, matching the five
  sites that already did. **The theming:** `/auth/login` + `/auth/me` now return
  `primaryColor`/`primaryForeground` (2 columns onto existing SELECTs — no migration, and NOT
  via `/tenants/verify`, which is throttled 10/min per IP). `lib/branding/scale.ts` derives the
  12-step ramp client-side, reusing the hand-tuned Aaramva curve as its shape and clamping at
  both ends (500 >= 4.5:1 vs white — one constraint covering both `text-brand-500` on white and
  white ink on a `bg-brand-500` fill; 400 >= 4.5:1 vs gray-900 `#101828`, the surface the
  original scale was tuned against at 4.53:1). **`MIN_ANCHOR_L` is `0.04`**, not the plan's
  original 0.12 — at 0.12 the floor rewrote ordinary dark colours that were already legible
  (`#001a33` navy, 17.56:1 vs white, came back as `#001f3d`). `apply.ts` writes inline vars on
  `<html>`, which outrank Tailwind's `@theme` `:root` rule — **all 79 `brand-*` consumer files
  re-theme with zero edits**, and Aaramva's look cannot regress because vars are written only
  when a school is active. **The write set is THEME-AWARE and `applyBrandScale` removes-then-sets**
  (a stale light-mode key would otherwise outrank `.dark`'s own rule): light = 12 steps +
  `--primary`(500) + ink + `--accent`(50) + `--accent-foreground`(500) + `--ring`(500) = 17;
  dark = 12 steps + `--primary`(**400**) + a contrast-picked dark ink = 14, deliberately NOT
  setting accent/ring because `.dark` already makes them neutral greys (chroma 0). **Why 400 in
  dark:** `:root` and `.dark` disagree on purpose — `.dark` sets `--primary` near-white
  (light fill + dark ink). Forcing the *clamped-dark* step 500 there put a navy school's
  `bg-primary` at **1.13:1** on the dark bg (invisible checkbox + floating white tick); step 400
  is clamped >= 4.5:1 vs `#101828`, giving 5.05:1. This is the same per-mode step rule the 79
  `brand-*` files already follow (`text-brand-500` light / `dark:text-brand-400`). `--accent`
  /`--accent-foreground`/`--ring` in `:root` are byte-identical to brand-50/500/500 — leaving
  them unset gave maroon schools **Aaramva-green dropdown hovers and focus rings**. Pre-paint
  `<script>` at the top of `<body>` (the next-themes pattern; NOT `next/script` beforeInteractive,
  whose execution doesn't block hydration) applies the cached scale — `branding:<slug>`,
  versioned, keyed by slug so impersonation can't bleed colours. It writes **only the 12 steps**,
  never `--primary`: it runs before React and cannot know the theme, so the ~5 `--primary`
  consumers may flash one frame — an accepted trade to keep the 79-file ramp flash-free. **`BrandingSync` gates on BOTH `accessToken` and the auth store's `isInitialized`** —
  without both, the authed panel hit the throttled `/tenants/verify` (10/min per IP) on every
  load for any school whose `primaryColor` is NULL, which is the *normal* case for an unbranded
  school (4 of 7 dev tenants). **Impersonated sessions need `/auth/me` backfill:** the
  `impersonation_handoff` payload carries no branding, so `providers.tsx` best-effort backfills
  via **`rawApi`** — NOT `api`, whose 401 interceptor would retry via `/auth/refresh`, and an
  impersonation token has no refresh cookie, so a failed call would log the impersonator straight
  out. **GOTCHA:** the tenant store is fed by `/auth/me`, which is not refetched after
  `PATCH /settings/profile` — Settings and onboarding must push saved branding into the store or
  a colour change is invisible until re-login. Super-admin console and `--chart-1..5` /
  `STATUS_CONFIG` stay Aaramva by design. **Known limit:** `--color-brand-500` is one variable
  serving 132 fills and 94 text usages, so an extreme pick (neon yellow) darkens for legibility
  rather than rendering vivid — the exact hex still shows in the settings swatch, report cards
  and mobile. `cache.ts`'s `defaultStorage()` guards the `window.localStorage` getter itself, not
  just its methods — as a default-parameter expression it evaluates OUTSIDE the function body's
  try/catch, and the getter itself throws `SecurityError` under Chrome "Block all cookies" and in
  sandboxed iframes.

- [x] HR lookup CRUD — Employment Types + Role Labels (`docs/superpowers/plans/2026-07-18-hr-lookup-crud-plan.md`,
  `docs/superpowers/specs/2026-07-18-hr-lookup-crud-design.md`) — two independent lookup-table
  promotions, both following the departments/designations admin-manageable pattern. **Employment
  Type** (`0016_employment_types.sql`): `staff_profiles.employment_type` promoted from a hardcoded
  4-value VARCHAR to a real per-school `employment_types` table (soft-deletable, `id`/`name`/
  `deleted_at`) — one forward-only transaction seeds the 4 legacy values (Permanent/Temporary/Part
  Time/Contract), adds `staff_profiles.employment_type_id` FK, backfills every existing row, then
  drops the old column (same complete-before-drop guarantee as `0002_drop_students_guardians.sql`).
  `EmploymentTypeService` + `/hr/employment-types` CRUD (`apps/api/src/modules/hr/
  employment-type.service.ts`; create/update PRINCIPAL_AND_ABOVE, delete OWNER_ONLY, read
  TEACHER_AND_ABOVE) wired through `StaffService`, the staff create/edit/list/detail pages, and
  onboarding's staff step — all now read/write `employmentTypeId`, never the retired string.
  **Role Labels** (`0017_role_labels.sql`): a pure display-layer override table (`role` PK,
  `label`) — an absent row means "use the default" (Title Case of the enum value, computed in
  `RoleLabelService`, not stored); the underlying `Role` enum, `@Roles()` guards, and `RolesGuard`
  are completely untouched. `EDITABLE_ROLES` allowlists exactly 6 of the 9 roles (SCHOOL_OWNER,
  PRINCIPAL, ACADEMIC_COORDINATOR, ACCOUNTANT, LIBRARIAN, TEACHER — platform/student/parent roles
  are not relabelable). `/hr/role-labels` is rename + reset only, deliberately no add/delete (the
  role set itself is fixed by the enum). Both features get a new **HR Setup** tab
  (`apps/web/app/(school)/hr/setup/page.tsx`) and `lib/role-labels.ts` fans the override into every
  role-display site in the HR staff UI (staff list DataTable's Role column, staff detail, edit
  page, onboarding trigger, CSV export) — found via grep sweep in the final task after the brief's
  own enumeration missed the staff-list DataTable, the most visible site on the page. **Rollout:**
  both migrations canary-applied to `demo` first (independently verified before fleet rollout),
  then `npm run migrate:tenants` rolled them to the remaining 7 tenants in one pass (14 applied, 0
  skipped, 0 pending); `--status` confirms all 8 tenants now on `0017_role_labels`. 665 api tests
  passing (82 suites; unchanged since the last backend task in this plan — Tasks 7-14 were
  frontend-only), web `tsc --noEmit` clean.

- [x] WEB-P Phase 0.5 — bs-calendar de-fork (`docs/web/WEB-P-PORTAL.md`, branch
  `feat/web-p-phase-1-auth-shell`) — `apps/web` now depends on the real `packages/bs-calendar`
  instead of its own vendored copy at the now-deleted `apps/web/lib/bs-calendar/` (confirmed
  byte-identical logic pre-de-fork; the fork only lacked one explanatory comment). **The real
  obstacle wasn't the swap itself, it was `apps/web/Dockerfile`'s production build context**
  (`context: apps/web`, not repo root, per `docs/api-contracts/DEPLOY-1-vps-deployment.md`) —
  a plain `file:../../packages/bs-calendar` dependency would have broken the deployed Docker
  build, which DEPLOY-1 explicitly said not to rewrite. Fix: `scripts/vendor-bs-calendar.mjs`
  (repo root) builds `packages/bs-calendar` and packs it into a gitignored
  `apps/web/vendor/bs-calendar.tgz`; `apps/web/package.json` depends on that tarball via
  `file:./vendor/bs-calendar.tgz`. **Caught mid-build, not guessed around:** the first preinstall
  wiring (`node ../../scripts/vendor-bs-calendar.mjs`) would have crashed the Docker `deps` stage
  with `MODULE_NOT_FOUND` — that relative path only resolves when `apps/web` sits under a real
  repo root, which the scoped Docker context isn't. Reproduced deterministically outside Docker,
  then fixed with `apps/web/scripts/preinstall.mjs`, a shim that always ships inside `apps/web`
  itself (Dockerfile now `COPY scripts/ scripts/` alongside `COPY vendor/ vendor/`) and gracefully
  no-ops when the real repo-root script isn't reachable. **`--ignore-scripts` was considered and
  rejected** — `apps/web` depends on `sharp`/`msw`/`unrs-resolver`, which have real install-time
  scripts that flag would have silently skipped. GOTCHA carried into the new vendor script's own
  comments: because the dependency is a packed **tarball** (not a directory), `package-lock.json`
  pins an integrity hash of its contents — changing `packages/bs-calendar` requires re-running
  the vendor script AND (per a correction confirmed 2026-07-22 while syncing the BS-2083 hotfix
  into this branch) `npm install bs-calendar@file:./vendor/bs-calendar.tgz` — an EXPLICIT
  re-resolution, not plain `npm install`, which does NOT detect a tarball content change at the
  same name/version/path and silently keeps serving stale data even after a full `node_modules`
  wipe — in `apps/web`, or the lockfile (and node_modules) stays stale.
  91/91 web vitest + 26/26 bs-calendar jest passing (unchanged baseline), web `tsc --noEmit` clean.
  **Unplanned but load-bearing finding from the required BS-date live-verification step (not
  caused by this task — the fork and the real package were logically identical):** the FIX-3 note
  above claiming "modern era is CORRECT" is wrong. `packages/bs-calendar`'s `2083` row has
  Ashadh = 31 days; three independent live sources agree Ashadh 2083 actually has 32 days and
  `1 Shrawan 2083 = 2026-07-17`, not the `2026-07-16` the table currently produces. FIX-3's scope
  and status were updated in place above to reflect this — no code fix attempted (out of scope for
  this task; needs its own audit pass, tracked as a widened FIX-3).

- [x] WEB-P Phase 1 — auth/shell/routing scaffold (`docs/web/WEB-P-PORTAL.md`, branch
  `feat/web-p-phase-1-auth-shell`) — STUDENT, PARENT, and TEACHER can now log in via the existing
  httpOnly-cookie web flow and land on a role-appropriate portal shell (no feature screens yet —
  skeleton only). Four tasks, each independently implemented and reviewed, plus a whole-branch
  review before merge-readiness. **T1 route access:** three new `ROUTE_ACCESS` rows
  (`apps/web/lib/route-access.ts`) — `/student`→STUDENT, `/parent`→PARENT, `/teacher`→TEACHER —
  and `homeRoute()` updated so those three roles land there post-login. **STUDENT/PARENT
  deliberately NOT added to `WEB_STAFF_ROLES`** (the unmapped-admin-route fallback list) — doing
  so would have silently granted them default access to every current/future unmapped admin
  route; TEACHER was already there (unrelated, pre-existing admin access, untouched). New
  `apps/web/lib/__tests__/route-access.test.ts` (first test file for this module) parametrizes
  over the live `ROUTE_ACCESS` array × all 9 roles for zero-regression coverage, plus a
  separately-hardcoded (non-tautological) assertion guarding the one security-relevant invariant.
  **T2 portal shell:** new `apps/web/components/layout/portal-shell.tsx` — mirrors `SchoolShell`'s
  session-hydration gate + `canAccess`/`AccessDenied` pattern (without its collapsible-sidebar
  machinery), a `(portal)` route group, 3 placeholder pages (`Portal home — {role} — {tenantName}`).
  Deliberately does NOT use `useRoleLabels()` for the role indicator — that hook hits a
  TEACHER_AND_ABOVE-gated HR endpoint that would 403 for STUDENT/PARENT. **T3 i18n + font:**
  `i18next`/`react-i18next` (not `next-intl` — no locale-routing/RSC-message-resolution need
  existed to justify it; a plain runtime client-provider toggle fits this app's existing
  `providers.tsx` pattern instead), English default + Nepali toggle, two seed keys (`nav.home`,
  `actions.signOut`). `actions.signOut`'s Nepali value is copied verbatim from mobile's already
  human-reviewed I18N-1 string (`साइन आउट`) — codepoint-identical, confirmed. `nav.home`'s
  Nepali value (`गृह`) has **no existing reviewed source** and is flagged as an unreviewed
  placeholder pending the same native-speaker pass I18N-1's mobile strings went through — do not
  treat it as equivalent in provenance to `actions.signOut`. Devanagari via `next/font/google`
  (`Noto_Sans_Devanagari`) wired as a **CSS `font-family` fallback** after `Outfit` in the actually-
  consumed `--font-sans`/`--font-heading` tokens (`globals.css`) — not a per-component switcher
  like mobile's `NpText`; the web platform's native fallback-by-Unicode-range makes that
  unnecessary. **T4 (found by the final whole-branch review, fixed same-day):** a *returning*
  STUDENT/PARENT (has the 7-day `_auth` marker cookie but no live in-memory session — e.g. tab
  closed and reopened) was bounced by the deliberately role-blind `apps/web/proxy.ts` to
  `/dashboard`, where `SchoolShell` had no redirect for these two roles (only for `PLATFORM_ADMIN`)
  and showed `AccessDenied` instead of sending them home — safe (no data exposure, working "Go to
  student" escape link) but broke the phase's own stated goal for its target users on every normal
  return visit. Fixed with one `useEffect` in `school-shell.tsx` mirroring the existing
  `PLATFORM_ADMIN` pattern; **TEACHER deliberately excluded** (still correctly renders the real
  admin `/dashboard` — that's the intended state until a separate later cutover phase). The bug's
  existence was established by directly reading `proxy.ts` + the pre-fix `school-shell.tsx`, not
  a live "before" repro; only the fix itself was live-reproduced via Playwright (both STUDENT and
  PARENT correctly landing on their portal home after a simulated return visit — a full
  `page.goto('/')`, which resets in-memory state while the marker cookie persists).
  **Live proof (Playwright against the running dev stack, not curl):** existing demo-tenant shim
  accounts (`student@demo.school`/`parent@demo.school`/`teacher@demo.school`) had passwords
  temporarily overridden to a known value, verified, then restored with a 401 read-back — same
  established convention as prior sessions' password shims. The demo tenant's `primaryColor` was
  also temporarily shimmed to a distinctive non-default color (its real value is the literal
  default, which would have made a branding check trivially pass either way) and restored after.
  All three roles: logged in via the real UI → landed on correct portal home → denied on a
  cross-role/admin path (TEACHER's case is nuanced by design: denied at `/finance` content while
  still legitimately seeing the admin shell chrome) → branding color visibly reflected the shim →
  logged out cleanly (session cleared, portal path required re-login). Nepali toggle + Devanagari
  font confirmed via screenshot (crisp glyphs, no tofu) and computed `font-family` inspection.
  **299 web tests passing (was 91 at Phase-0.5 baseline; +205 route-access, +3 locale-store), web
  `tsc --noEmit` clean.** Each of the 4 tasks individually reviewed and approved before the next
  began; a final whole-branch review (opus) additionally checked cross-task integration (route-
  access ↔ shell wiring, i18n not disturbing the auth-gating order, `WEB_STAFF_ROLES`'s final
  state, `providers.tsx` init ordering, no stale `@/lib/bs-calendar` imports survived Phase 0.5,
  and no staff-role assumption in the login/session-restore path for the two brand-new web-portal
  roles) before landing T4's fix. Not pushed; no PR opened — awaiting the human's go-ahead before
  Phase 2 (Teacher core: attendance-marking grid, marks-entry grid, assignment view/review + net-
  new creation flow, the 4 pre-existing TEACHER 403 bugs).

- [x] WEB-P branch synced with the BS-2083 calendar hotfix (merged `main` into
  `feat/web-p-phase-1-auth-shell`, 2026-07-22) — the standalone
  `hotfix/bs-2083-ashadh-days` PR (see FIX-3 above) landed on `main` first; merged (not rebased,
  per instruction, to preserve this branch's already-reviewed history) rather than cherry-picked,
  so future syncs stay simple. **Two real conflicts, both resolved correctly:** (1) `CLAUDE.md`'s
  FIX-3 note — both branches had edited it independently (WEB-P documented the *discovery*, the
  hotfix documented the *fix*) — resolved by keeping the hotfix's fuller, accurate version
  entire, since it's a strict superset of the story. (2) `apps/web/lib/bs-calendar/data.ts` —
  modify/delete: WEB-P's Phase 0.5 had already deleted this file (de-forked to depend on the real
  `packages/bs-calendar` package instead); `main`'s hotfix had modified it in place (since `main`
  never had the de-fork). Resolved by keeping the **deletion** — the file is superseded by the
  now-fixed real package, which this branch already depends on via the vendored tarball;
  resurrecting it would have reintroduced the exact fork Phase 0.5 removed. **Found and fixed a
  second, more severe form of the tarball-vendoring gotcha while verifying the merge actually took
  effect:** plain `npm install` (as the vendor script's own comment previously — incorrectly —
  recommended) does **not** refresh `apps/web`'s consumption of `packages/bs-calendar` when the
  tarball's *content* changes at the same package name/version/path — confirmed by deleting
  `node_modules/bs-calendar` entirely and reinstalling from scratch, which still served the stale,
  pre-hotfix date. Only an **explicit re-resolution**,
  `npm install bs-calendar@file:./vendor/bs-calendar.tgz`, forces npm to re-hash and re-extract.
  `scripts/vendor-bs-calendar.mjs`'s top comment, `docs/api-contracts/DEPLOY-1-vps-deployment.md`,
  and the Phase 0.5 entry above were all corrected to the verified remedy — this matters for the
  next real deploy, since Docker's `deps` stage runs the equivalent of a fresh install every
  build and a silently-stale tarball there would ship wrong dates to production with no error.
  Live-verified end-to-end after the fix: logged into the admin portal as an existing demo-tenant
  account (temporarily shimmed password, restored + 401-proven after) and confirmed
  `/students/new`'s Admission Date (BS) defaults to **2083 / Shrawan / 6** (today, post-hotfix) —
  screenshot-confirmed, not just asserted. `apps/web` 299/299 tests passing, `tsc --noEmit` clean,
  unchanged from pre-merge baseline.

- [x] WEB-P Phase 2 — Teacher core (`docs/web/WEB-P-PORTAL.md`, branch
  `feat/web-p-phase-2-teacher-core`, off Phase 1) — three real, desktop-optimized teacher screens
  plus a from-scratch dashboard, replacing Phase 1's placeholder teacher home. Five tasks, each
  independently implemented and reviewed (three needed one fix round), plus a whole-branch review.
  **T1 dashboard:** `/teacher` rebuilt from scratch — today's classes, my sections, my attendance
  this month, plus the existing weekly-attendance/upcoming-exams widgets — calling ONLY
  `TEACHER_AND_ABOVE` endpoints, never `PRINCIPAL_AND_ABOVE`-only `overview`/`activity`. **Fixes 2 of
  the 4 pre-existing TEACHER 403 bugs by construction**, not by changing backend roles. Four
  teacher-scoped backend endpoints that existed but had zero frontend callers before this phase
  (`GET /timetable/my`, `/timetable/my/sections`, `/hr/staff/me`, `/attendance/staff/my/summary`)
  got their first hooks/API-client methods here (`lib/api/timetable.api.ts` new; `hr.api.ts`/
  `attendance.api.ts` extended). `PortalShell` gained a role-aware nav (STUDENT/PARENT completely
  unaffected — still exactly one "Home" link; TEACHER gets Dashboard/Attendance/Marks/Assignments).
  **T2 attendance grid:** `/teacher/attendance` reuses the existing `AttendanceGrid` component
  (already had "Mark All Present" built in) and admin's hooks UNCHANGED — only a new page
  composition. Picker defaults to the teacher's own sections (`useMySections`, auto-selects if
  exactly one) with a collapsed "Browse all classes" fallback, since `POST /attendance/students/bulk`
  intentionally allows any teacher to mark any section (accountability via `marked_by`, not a
  permissions gate) — the soft-scope is never hard-blocked. **T3 marks grid:** `/teacher/marks`
  reuses the existing `MarksGrid` component unchanged; picker uses a NEW, purpose-built
  `GET /exams/schedules/my` (backend-ready, previously unwired) instead of admin's school-wide
  3-step cascade — simpler and correctly scoped, no browse-all here by design (no teacher-scoped
  "all schedules" endpoint exists; a teacher covering another's exam still reaches the write
  endpoint via admin's `/exams/marks`, confirmed reachable). **Found via review, not before shipping:
  a real stale-roster race** — an async-resolved `selectedSchedule` fed a dependent roster query
  with no `enabled` gate, so a fresh page load/deep link could briefly fetch an unrelated,
  unfiltered roster that `MarksGrid`'s mount-once internal state would never self-correct from.
  Fixed: `useStudents` gained an optional `{enabled}` param (backward-compatible — every other
  caller unaffected, confirmed by grep), gated on `!!selectedSchedule`, plus a real 4-state render
  machine (loading/error/not-found/ready) replacing a silent `?? 100` fullMarks fallback. **T4
  assignments view/review:** `/teacher/assignments` + `/teacher/assignments/[id]` reuse ALL existing
  assignment hooks unchanged (`useAssignments`, `useAssignment`, `useAssignmentSubmissions`,
  `usePublishAssignment`, `useCloseAssignment`, `useReviewSubmission`) — zero new hooks needed.
  **The identical race-condition bug class recurred**, milder, on the list page (`classId` from
  async `useMySections()` feeding `useAssignments()` unguarded — self-corrects, no permanent stale
  state, no security exposure since the backend already permits broad viewing, but the same
  unguarded-dependent-query shape, and it contradicted the implementer's own report). Fixed the same
  way: `useAssignments` gained the same `{enabled}` param; a `scopeReady` flag (handling explicit
  browse-all, own-scope-resolved-with-a-class-picked, AND own-scope-resolved-with-zero-sections as
  three legitimately-ready cases) gates both the query and a render-level skeleton — closing even
  the one-render transitional gap a naive `!loading`-only guard would've missed. **T5 assignment
  creation (net-new — mobile has no creation UI to reference; admin's create dialog is the only
  reference):** wires up T4's previously-inert "New Assignment" button. Reuses `useCreateAssignment`
  and `uploadFile(file, 'assignment-attachment')` unchanged; always creates DRAFT (no publish-now
  toggle — publishing stays T4's separate detail-page action, matching admin's already-shipped
  behavior). **Explicitly told about the two prior race-condition findings and asked to proactively
  self-check before submitting** — found and fixed one instance in its own new code (a class picker
  that could read as "genuinely empty" before `useMySections()` settled) *before* review, using the
  same gating pattern; the review independently traced every render path and confirmed the fix is
  complete. **Investigated but deliberately NOT built (per explicit ruling):** whether TEACHER
  should approve/reject student leave requests — confirmed this is correct backend behavior
  (`PATCH /attendance/leave/:id/review` rightly excludes TEACHER) with a leftover *admin-portal* UI
  affordance (buttons render, click 403s — same "UI leak" pattern as student-edit), not a gap. The
  new portal builds no approve/reject affordance; the old admin page's dead buttons are left alone
  as a known, documented issue (`docs/web/WEB-P-PORTAL.md` §6) — moot once Phase 6 removes teacher
  admin access entirely. **Live-proof discipline held throughout:** every workflow-touching task used
  a real demo-tenant teacher account (`teacher@demo.school`, shim/verify/restore, real Playwright
  browser automation against the actual UI, 401-read-back-proven restoration) and confirmed the
  relevant accountability field (`marked_by`, `entered_by`, `reviewed_by`, `created_by`) via a live
  Postgres SELECT. T4's round trip additionally had a demo STUDENT submit via a direct API call (no
  student submission UI exists yet — correctly not faked as UI) before the teacher reviewed it
  through the real built UI. T5's attachment path was honestly reported as not fully exercised
  (storage configured, presign succeeded, but MinIO wasn't running in this dev environment so the
  PUT correctly failed — no bogus key was recorded). **Final whole-branch review** additionally
  re-examined T1/T2 (approved before the race-condition bug class was even identified) with fresh
  eyes and confirmed neither is vulnerable to it, confirmed all 4 teacher nav links resolve with no
  remaining 404s, confirmed `route-access.ts` was never touched (the `/teacher` prefix from Phase 1
  already covers every new sub-route via longest-prefix matching), and confirmed no client-side
  check anywhere could be mistaken for a real security boundary. Flagged the marks-screen
  browse-all gap for a decision (ruled intentional, documented in place) and a stale
  `route-access.ts` citation (refreshed). **T6 (post-report addition, human-requested):** the
  recurring async-gate race fix (T3/T4/T5) had been verified only live, never pinned with a test —
  correctly called out as a real gap, since "verified live once" gives zero protection against a
  future unrelated edit silently reintroducing a bug that had *already* recurred twice by accident
  within this same phase. Added this codebase's **first hook-level/DOM tests** (everything before
  this was a pure Node-environment logic test): `@testing-library/react` + `jsdom`, scoped via
  PER-FILE `// @vitest-environment jsdom` directives (global `vitest.config.ts` environment
  untouched) — `useStudents`'s and `useAssignments`'s new `{enabled}` options each get `renderHook`
  tests proving the gated query never fires (call-count assertion, not just a timing-fragile
  `fetchStatus` check) AND a cross-gate-isolation case (real tenant slug present + `enabled: false`
  → still idle, proving the new gate isn't hiding behind the pre-existing `!!slug` gate). T5's
  inline expression was extracted to a named `resolveScopeReady()` pure function (verified
  behavior-identical) and pinned with plain logic tests, no new framework needed for that one.
  Review specifically mental-reverted each fix against the new tests to confirm they'd actually
  fail, not just pass trivially — they do. **312/312 tests (was 299 — 13 new), `tsc --noEmit`
  clean.** Not pushed; no PR opened — awaiting the human's
  go-ahead before Phase 3 (HR self-service: own leave, own profile, own timetable, own payroll
  slips — backend already exists, pure frontend).

- [x] WEB-P Phase 3 — Teacher HR self-service (`docs/web/WEB-P-PORTAL.md`, branch
  `feat/web-p-phase-3-hr-self-service`, off Phase 2) — four new screens under
  `apps/web/app/(portal)/teacher/`, all endpoints pre-existing on the backend and never surfaced in
  any UI (admin or mobile) before this phase; **zero backend files touched anywhere in the diff.**
  **Two ownership questions were investigated and written to
  `docs/web/phase-3-ownership-findings.md` BEFORE any screen was built**, per the phase's own
  explicit instruction (both later independently re-verified against real source by the final
  whole-branch review and confirmed to hold): (1) `GET /timetable/my` — SAFE despite internally
  reusing `getTeacherTimetable`'s query logic (the same function backing the unchecked, still-
  unfixed `GET /timetable/teacher/:teacherId` from §7) — the id comes exclusively from
  `@CurrentUser()` in the controller, never a path param, so no caller can ever supply anyone's id
  but their own; the *id's origin*, not the shared query, is what makes a route safe or not. (2)
  `GET /hr/payroll/staff/:userId/history` — the route DOES accept an arbitrary `:userId` path
  param, but `payroll.service.ts`'s `getStaffSalaryHistory` calls the same `assertSelfOrHrAdmin`
  utility already relied on for leave-balance, before any query runs — a teacher passing a peer's
  id gets a real 403, confirmed live. **T1 own profile (view-only):** confirmed there is no
  self-edit endpoint at all (`PATCH /hr/staff/:id` is `PRINCIPAL_AND_ABOVE`-only, no `PATCH
  /hr/staff/me` exists) — built as pure display, mirroring the admin staff-detail page's field
  grouping/conditionals exactly minus the edit affordance and photo-upload overlay it correctly
  stripped. **T2 own leave (full write flow):** the phase's biggest task — reused
  `useLeaveTypes`/`useApplyLeave`/`useLeaveBalance` unchanged, added two new hook+endpoint pairs
  (`GET /hr/leave/my` self-scoped list, `PATCH /hr/leave/:id/cancel`). **Found and fixed a real
  integration bug during live-proofing:** the shared `useApplyLeave` hook only invalidates the
  admin's `['hr','leave']` query key, never this screen's new `['hr','leave-my']` key, so a
  successful apply wrote to Postgres correctly but silently didn't refresh the table — fixed at the
  **page** level (explicit `queryClient.invalidateQueries`), deliberately leaving the shared hook
  untouched to avoid any blast radius into the admin leave page's own apply flow. Full live proof:
  applied a real leave request as the demo teacher → PENDING in Postgres → cancelled via the UI →
  CANCELLED in Postgres (204) → cross-user IDOR probes on both `leave/balance/:userId` and
  `leave/:id/cancel` 403'd live against a real other-user row, with a Postgres control-check
  proving the forbidden cancel had zero effect. **T3 own timetable (weekly grid):** almost pure UI —
  `useMyTimetable()` already existed from Phase 2, no new hook needed. Explicitly built as a NEW
  small read-only component rather than reusing the admin's per-section `TimetableGrid` (structurally
  different slot shape — `section`/`className` per slot vs. admin's `teacher: {fullName}` — and the
  admin one ships add/delete-slot mutations that would violate this screen's read-only requirement);
  copied its visual conventions (DAYS array, table styling) instead. Grid rows are genuinely derived
  from the data (no hardcoded period count); Saturday (`"6"`) correctly never rendered as a column.
  **T4 own payroll history:** one new hook+endpoint pair
  (`GET /hr/payroll/staff/:userId/history`). **Real, accepted data-shape limitation, designed around
  rather than fixed:** `SalarySlipResponseDto` has no `monthBs`/`yearBs` field (the SQL joins
  `payroll_months` only for its `ORDER BY`, never selects its columns), and `GET /hr/payroll/months`
  — the only endpoint that could resolve a label — is `ACCOUNTANT_AND_ABOVE`-only, so a teacher can't
  call it either; `paymentDate`/`paymentMethod` are effectively always null (never written anywhere
  in `payroll.service.ts`). The screen shows slips in the backend's guaranteed order (most-recent
  fiscal month first) using `createdAt` (added to the `SalarySlip` frontend type, which was missing
  it despite the backend DTO already returning it) via `<BsDate>` instead of a fabricated month
  label. Added a `!userId || isLoading` hydration guard since `useMyPayrollHistory` is
  `enabled: !!userId` and TanStack Query keeps `isLoading` false while a query is merely disabled.
  IDOR probe: own id → 200 (empty array — demo tenant has zero `salary_slips` rows tenant-wide, a
  genuine data limitation, not a shortcut); cross-user id (school owner) → 403, verified the rejection
  fires **before** any query runs (`assertSelfOrHrAdmin` at the top of the function). **T5 nav
  wiring:** added all 4 screens to `PortalShell`'s existing role-aware `TEACHER_NAV_ITEMS` (done
  directly, not dispatched — a 4-line, single-file, no-new-logic change); also made the nav
  `flex-wrap` since it now holds 8 items, confirmed via live Playwright screenshot that all 8 fit on
  one line at desktop width with no overflow and the STUDENT/PARENT single-link path is completely
  unaffected (a lone item can't wrap). **Final whole-branch review (opus)** independently
  re-derived both ownership rulings from the real backend source (not just trusting the findings
  doc) and confirmed both hold; caught one Minor cross-task consistency gap — the Leave screen's
  balance section gated only on `balancesLoading`, missing the same `!userId` guard the Payroll
  screen added for the identical `useLeaveBalance(userId)` async-hydration shape (not reachable
  today, since `PortalShell` only mounts page children once `user.role` is truthy, but flagged as
  the same structurally-fragile async-gate pattern this project has been bitten by multiple times
  before) — fixed directly for consistency. Confirmed throughout: no client-side ownership/role
  check was invented anywhere in the 4 screens that could disagree with the backend's real check;
  `useApplyLeave` and the admin leave page are provably untouched; `route-access.ts` needed no
  change (the `/teacher` prefix from Phase 1 already covers every new sub-route). **312/312 tests
  unchanged throughout (pure-frontend phase — live HTTP+Postgres proof was the verification method,
  not new unit tests), `tsc --noEmit` clean.** Not pushed; no PR opened — awaiting the human's
  go-ahead before Phase 4 (Student module).

- [x] WEB-P Phase 4 — Student module (`docs/web/WEB-P-PORTAL.md`, `docs/web/phase-4-findings.md`,
  branch `feat/web-p-phase-4-student`, off Phase 3) — six new screens under
  `apps/web/app/(portal)/student/`, replacing Phase 1's placeholder. Per the locked spec: no fee
  screen (STUDENT has zero finance API access) and no leave-request screen (parent files leave on
  the student's behalf) — neither built. **Real security fix, found during research before any
  screen was built:** `GET /timetable/section/:sectionId` lists `Role.STUDENT` in its `@Roles()`
  but `TimetableService.getSectionTimetable` only had an ownership check for `Role.PARENT` — any
  authenticated student could read any OTHER section's full timetable by passing an arbitrary
  sectionId, with no error and no scoping. Not the same as the already-known `GET /timetable/
  teacher/:teacherId` gap (that route is TEACHER_AND_ABOVE-only, not STUDENT-reachable), and not
  an instance of "staff have broad school-structure read access by design" (TEACHER's own
  unrestricted access there is correct, tested, and untouched by this fix) — STUDENT is a
  different trust tier and the missing branch was a genuine oversight, confirmed by the existing
  unit test itself using `Role.TEACHER`, never asserting anything about STUDENT. Fixed with a
  STUDENT branch mirroring the PARENT one (direct `students.user_id` match, no `guardians` JOIN
  needed) — purely additive, TEACHER behavior unchanged. **T1 dashboard:** composes attendance
  summary, today's timetable, upcoming assignments (client-filtered `mySubmission === null &&
  status === 'PUBLISHED'`, sorted by due date, capped at 5), and recent notices — pure
  composition, zero new data-fetching logic. **T2 attendance calendar:** desktop BS-month grid
  (not a mobile port); year-to-date percent sourced directly from the backend's official
  `attendancePercent` (never recomputed client-side — a second, differently-scoped formula would
  risk disagreeing with the official figure); the visible month's summary strip shows raw
  present/absent/late/leave counts only. **Found and avoided propagating a second real, pre-
  existing bug while building this:** `BsDateInput`'s existing `fireChange()` converts
  `bsToAd(...)` to an AD string via `.toISOString().split('T')[0]` — confirmed LIVE on this
  Asia/Kathmandu (UTC+5:45) dev machine that this shifts the date backward by one day (the exact
  FIX-2 bug class, but never caught on the web frontend). `BsDateInput` itself was left alone
  (broad blast radius across the admin app, out of scope) but the new screen uses its own local
  `formatLocalDateAd()` (direct component extraction, no `toISOString()`) instead of copying the
  buggy pattern. Also corrected mid-task: Saturday's tint was initially built to always override a
  recorded status; checked against mobile's actual shipped `AttendanceCalendar` precedence
  (`cfg ? cfg.bg : isSat ? SATURDAY_HIGHLIGHT.bg : ...` — a real status always wins, the Saturday
  tint is only the fallback) and corrected to match. **T3 timetable:** `GET /timetable/section/
  :sectionId` (already existed, STUDENT-allowed; academic.api.ts already had a
  `getSectionTimetable` wrapper and use-academic.ts already had a hook with the exact
  `enabled: !!sectionId` gate needed — reused as-is via the established `sectionId ?? ''`
  pattern, no new hook). Read-only period-rows × day-columns table (verified against and matching
  the teacher portal's `MyTimetableGrid` convention, not the plan's own unverified first-draft
  layout, which assumed day-columns with stacked cards — the plan's draft was wrong, the shipped
  screen follows the real established pattern). Review caught a real gap: `useStudentMeProfile()`'s
  own error state wasn't originally surfaced, so a genuine `GET /students/me` outage would have
  misrendered as a false "not enrolled" message — fixed before merge. **T4 notices:** reuses the
  existing `useNotices` hook verbatim (already correctly audience-filtered for STUDENT server-side)
  — zero new hooks, zero new API methods. **T5 results + PDF:** reuses the existing, already-
  shipped `ReportCardView` component (`components/exams/report-card.tsx`, shared with the admin
  results page) for on-page rendering instead of building per-exam-type cards from scratch — a
  shortcut found during planning that avoided duplicating already-reviewed rendering logic. The
  report-card PDF is generated on-the-fly per request (`buildReportCardPdf`), NOT a stored FILE-1
  object — no presigned-URL step exists anywhere for it (confirmed: no web page downloaded a PDF
  before this task); the download button is a direct authenticated blob fetch
  (`responseType: 'blob'`) + a new small `downloadBlob()` primitive, shown only once
  `examResults.length > 0` so the backend's "not published yet" 409 can never be reached from
  this UI. **T6 assignments (list + detail + submission — the phase's headline feature):** list
  splits "To submit" / "Submitted"; detail derives the assignment from the `GET /assignments/me`
  list-query cache by id (confirmed live: no student-scoped single-assignment GET exists,
  `GET /assignments/:id` is staff-only and 403s STUDENT) — never a fallback fetch, so a foreign id
  in the URL just shows "not found," nothing to leak. Submission reuses the assignment-scoped
  presign → raw PUT → confirm flow (`POST /assignments/:id/submissions/presign-upload`, NOT the
  generic `/files/presign-upload`, which explicitly rejects `submission-file` uploads regardless
  of role since it's `scopedOnly`); client "at least one of text/file" validation matches the
  server's exact rule; a 409 (reviewed/closed) renders as a distinct "Submission locked" message,
  never a generic error toast; a `REVIEWED` submission renders fully read-only. **Full live
  round-trip proof, real Playwright browser session (not curl), both demo accounts shimmed/
  verified/restored (401-proven after):** logged in as the demo student → submitted a real text
  answer to a crafted PUBLISHED assignment through the actual submit form → Postgres read-back
  confirmed the row → logged in as the demo teacher → the **existing, unmodified Phase 2**
  `/teacher/assignments/:id` review screen showed the Phase-4-submitted content → reviewed it
  (marks 9, feedback) through that real UI → Postgres read-back confirmed `REVIEWED`/marks/
  feedback/`reviewed_by`, plus two `notifications` rows (student + guardian) confirming PUSH-1's
  event pipeline fired correctly for this new write path → logged back in as the student → the
  assignment now rendered fully read-only with marks and feedback visible. This closes the loop
  Phase 2 could previously only test by having a demo student submit via a raw API call — this
  time both sides of the portal round-tripped through real UI. **IDOR probes (raw HTTP,
  deliberately outside the UI):** a second crafted assignment scoped to a different section
  (Grade 9 B, the demo student is in Grade 9 A) was confirmed absent from the student's own
  `/assignments/me` list; a direct submit attempt against it returned `403 FORBIDDEN_SCOPE` with
  zero rows created (Postgres-confirmed); a direct `GET /assignments/:id` against it returned
  `403 FORBIDDEN_ROLE`. The timetable IDOR fix was independently re-probed live post-fix:
  cross-section request → `403 FORBIDDEN_SCOPE`, own section → 200 with real data. Attendance and
  results endpoints are structurally IDOR-proof by construction (student always resolved from
  `token.userId → students.user_id`, never a param) — confirmed by direct source reading, nothing
  to probe beyond that. **Two lower-severity gaps found during research, deliberately NOT fixed
  (out of the explicit IDOR-probe scope named for this phase):** `GET /communication/notices/:id`
  has no audience/publish filtering at all (any role can fetch any single notice by UUID guess) —
  not exercised by the new notices screen, which never calls it (the list already returns full
  `body` text per row); a `warning-700` Tailwind class is used with no defined CSS variable behind
  it (`app/globals.css`'s warning scale stops at `-600`) — but this is a widespread, pre-existing
  gap already present in `status-badge.tsx` itself and several admin pages, correctly followed as
  established convention rather than deviated from. **Async-gate bug class (4 prior occurrences
  across Phases 2-3, watched for explicitly this phase):** the two real async-dependency points
  built this phase (T3's `sectionId` from `useStudentMeProfile()`, T1's dashboard greeting) were
  built with the correct `!value || isLoading` guard shape from the start rather than shipped
  broken and fixed later, so there was no regression test to add — per the standing instruction
  from the Phase 3 follow-up, no shared test helper was built either, for the same reason as
  before. Full details, including the exact live-proof transcript, in `docs/web/
  phase-4-findings.md`. **667 api tests (was 665, +2 for the timetable IDOR fix's regression
  tests), 317 web tests (unchanged — pure-frontend screens plus one backend fix; live
  HTTP+Postgres+Playwright was the verification method for the screens themselves), `tsc --noEmit`
  clean.** Not pushed; no PR opened — awaiting the human's go-ahead before Phase 5 (Parent module).

- [x] WEB-P Phase 5 — Parent module (`docs/web/WEB-P-PORTAL.md`, `docs/web/phase-5-findings.md`,
  branch `feat/web-p-phase-5-parent`, off Phase 4 @ `28bb49a`) — 7 new screens under
  `apps/web/app/(portal)/parent/` (Dashboard, Attendance+leave-request, Timetable, Notices,
  Results+PDF, Assignments, Fees) plus a shared child-switcher, replacing Phase 1's placeholder.
  **Step-0 IDOR audit** (`docs/web/phase-5-idor-audit.md`, predates the plan) verified every
  child-scoped endpoint already has a real `guardians`-table ownership check — **zero apps/api
  files touched anywhere in this branch** (api stays at 667, unchanged), and no new backend gap
  was found mid-build (unlike Phase 4, which found a real STUDENT-timetable oversight). **Locked
  spec, per §3:** no submission affordance for PARENT anywhere (Assignments view-only, confirmed
  `POST /assignments/:id/submissions` is `@Roles(Role.STUDENT)`-only), Fees is view-only rendering
  of `useStudentLedger`'s existing response (no invoice-detail-by-id endpoint exists, none
  invented), and a **hard exclusion** — no screen may call
  `GET /finance/payments/{esewa|khalti}/status/:transactionUuid` (side-effecting despite being a
  GET; can finalize/credit a stuck transaction) or `GET /finance/payment-gateways` — checkout stays
  fully out of scope for v1. **`useSelectedChild()`** (Task 2) centralizes "which child is
  currently selected + is one selected yet" in one hook every per-child screen (4-9) reads from,
  never re-deriving — the single biggest async-gate surface of any phase so far (5 screens all
  depend on it). **Task 10 escalation:** adding a shell-level global `<ChildSwitcher>` per the
  plan's own explicit instruction ("visible on every parent screen, not just per-page") created
  real, independently-verified duplication with 5 screens' pre-existing page-level instances — a
  genuine plan-text-vs-UI-practice conflict, escalated to the human rather than resolved
  unilaterally; decision was shell-wins, the 5 redundant instances removed in a reviewed follow-up
  fix. **Whole-branch review (opus) found one Important, zero-security-impact finding:** a new
  `parent.store`'s `selectedChildId` was never cleared on logout and `useSelectedChild()` only
  auto-picked a default when the selection was empty, never re-validating an *existing* selection
  against a newly-logged-in different parent's own roster — a same-tab account switch left every
  per-child screen stuck on a permanent skeleton (no data-leak risk, since every downstream query
  is still backend-guardian-scoped and 403s on a foreign id; purely a stranded-UI bug). Fixed:
  the hook's effect now re-picks whenever the current selection doesn't match any child in the
  fetched roster (not only when empty), plus a `parent.store.clear()` on logout for hygiene; a new
  `use-selected-child.test.tsx` pins the self-healing behavior (this hook is the one place 5
  screens' worth of blast radius lives, unlike prior phases' narrow single-call-site `{enabled}`
  fixes which stayed untested by design). **Live-proof method note:** no browser-automation tool
  was available this session (unlike Phases 1-4's real Playwright sessions) — verification was raw
  HTTP + Postgres against the running dev stack instead, disclosed explicitly rather than
  glossed over; a real second family (guardian + parent account) was provisioned via the actual
  admin API (`POST /students/:studentId/guardians`, `ProvisionGuardianDto`) for IDOR probing since
  none pre-existed, then fully deleted after. Confirmed live: all 7 screens' underlying endpoints
  200 for family 1's own children; a real `POST /attendance/leave` filed and Postgres-confirmed
  (`student_id`/`applied_by` matching); **9 cross-family IDOR probes, all correctly rejected**
  (attendance summary/history, results, report-card json+PDF, fee assignments/ledger, the leave
  write-path with 0 rows created, and an out-of-scope timetable section) — the timetable ownership
  check is confirmed **section-based** (`getSectionTimetable`'s PARENT branch: any child enrolled
  in that section satisfies it), so the real negative probe used a section neither family has a
  child in, not a same-section cross-family request (which is legitimately authorized under this
  model). Report-card PDF: Binod's only result was genuinely unpublished in demo data (`409` —
  a true privacy-gate hit), so the exam type was briefly published to get a full proof (own-child
  `200` + `%PDF-1.3` magic bytes; cross-family `403` even while published), then unpublished again
  and the 3 resulting `notifications` rows deleted. **Environment gotcha (worktree-specific, not a
  code regression):** this worktree's `node_modules/@prisma/client` was stale (121 TS errors on
  `nest start --watch`, all pre-existing `$queryRawUnsafe<T>()` files this phase never touched) —
  fixed with `npx prisma generate`; future fresh worktrees may need the same. All crafted rows
  (leave application, guardian, parent user, notifications) deleted with read-backs; 3 shimmed
  passwords restored, 401-proven. **667 api tests (unchanged, zero apps/api diff), 320 web tests
  (was 317, +3 from the whole-branch-review fix), `tsc --noEmit` clean.** Per the locked ruling in
  `docs/web/WEB-P-PORTAL.md` §7, this phase's clean suite does **not** authorize Phase 6 (teacher
  login cutover) — that needs the human's manual parity sign-off. Not pushed; no PR opened —
  awaiting the human's go-ahead before any further phase.

**PUSH-1 backlog (deliberate descopes):**
- `invoice.created` event: skipped — bulk invoice generation needs a spam-vs-signal decision
  (one push per invoice vs digest) before emitting per-invoice events. payment.received +
  invoice.overdue cover finance meanwhile.
- ~~On-device push receipt~~ — **DONE in EAS-1**: the preview APK on a real Android device
  (motorola edge 60 pro) received both the absence and notice pushes with correct tap-routing;
  first real device token registered; Expo delivered (no `DeviceNotRegistered`). Required the
  cleartext fix (Android 9+ blocks `http://` by default) — see the EAS-1 entry above.
- CLASS-audience notices are not visible in GET /notices to STUDENT/PARENT roles
  (ROLE_AUDIENCES gap) even though PUSH-1 now notifies class students+parents about them.
- ~~Force-change-on-first-login for emailed temp passwords~~ — DONE in POL-1 T4.

- [x] BILL-6 — corrections: credit notes, refunds, write-offs (`docs/api-contracts/BILL-6-SPEC.md`,
  `apps/api/src/modules/finance/bill-correction.*`) — two checkpoints, one shared request→approve/
  reject/reverse workflow. **No new ledger table** — `student_ledger_entries` already permitted
  `CREDIT_NOTE`/`REFUND`/`WRITE_OFF` (0021_bill_ledger.sql); `bill_corrections`
  (`0029_bill_corrections.sql`) is the workflow + audit wrapper, posting through the existing
  `LedgerService.withStudentLock`/`postEntryInTx`/`reverse` unchanged. **Discovery decided**:
  reason lookup is a NEW `correction_reasons` table, not a reuse of `discount_reasons` — different
  domain (post-billing correction vs. pre-billing discount); same CRUD shape, wired into the
  existing `BillCatalogController`. Threshold (`credit_note_approval_threshold`, default 5000)
  lives on the public `tenants` row (Prisma migration `20260801125505_bill6_credit_note_
  threshold`) — same home as `invoiceNumberingReset`, per precedent.

  **B6-10 direction, the invariant that matters most:** credit notes and write-offs are CREDITs
  (reduce what the student owes); a refund is a DEBIT against the student's credit balance
  (consumes their advance — never increases what they owe). `approve()` dispatches both the
  direction and the re-validation cap by `correction.type` — one method handles all three, since
  request is the only genuinely type-specific step.

  **Checkpoint A — credit notes:** below the tenant's threshold auto-posts at request time
  (`requires_approval=false`, decider=requester, ledger entry in the same transaction); at/above
  stays `REQUESTED` until an `OWNER_ONLY` approve. B6-2 over-credit guard caps a credit note at
  the invoice's (or line's) `total_receivable − CLEARED payments − prior APPROVED credits`.

  **Checkpoint B — refunds + write-offs:** B6-3 — both ALWAYS require approval regardless of
  amount, never auto-post (unlike credit notes). Refund (B6-6) draws only from available advance
  credit (`availableCredit` — the magnitude of a negative ledger balance); rejected at validation,
  and again at approval time, if insufficient. Write-off targets a specific invoice (same
  `creditableAmount` cap a credit note uses) OR the student's overall balance when no invoice is
  given (`owedBalance` — capped at the live ledger balance, spec §3 "target invoice/balance").
  **BILL-BUGS.md CORRECTIONS-CAP-SHARED (deviation, logged not blocking):** `creditableAmount`'s
  "already credited" sum was widened from `CREDIT_NOTE`-only to `CREDIT_NOTE`+`WRITE_OFF` — an
  approved invoice-scoped write-off must shrink the room left for a later credit note on the same
  invoice (and vice versa), or the two correction types could combine to over-correct past an
  invoice's real outstanding amount. Two more logged, non-blocking deviations cover why refund has
  no invoice target and why write-off has no line-level (`targetInvoiceItemId`) option — both read
  directly from the spec's own wording, not invented.

  Reject (`OWNER_ONLY`, conditional UPDATE guards a concurrent double-decide) and reverse
  (delegates entirely to the pre-existing `LedgerService.reverse` — the correction row stays
  `APPROVED`, `ledger_entry_id` still points at the original entry, "both entries visible" is the
  ledger's own `reverses_entry_id` chain surfaced by `findOne`'s audit trail) are fully generic
  across all three types, unchanged between checkpoints. Gapless `correction_number` via the
  existing `sequences` table, own doctype (`COR-<bsYear>-NNNNNN`, CONTINUOUS only). PARENT reads
  (`GET /finance/corrections` + `/:id`) are object-scoped via `guardians`, same pattern as every
  other finance endpoint.

  **Live-proved against real Postgres both checkpoints** (crafted fixtures on demo students,
  fully cleaned up after — every posted ledger entry reversed, never deleted per R3, so balances
  net back to their pre-proof values; all scaffolding hard-deleted; shimmed passwords restored and
  401-proven dead each time): **Checkpoint A** — direction invariant, owe 5,000 credit 1,200 →
  balance **exactly 3,800.00**, one `CREDIT_NOTE` entry; threshold auto-post-vs-pending, accountant
  approve 403; pending-posts-nothing; reversal to the exact prior value (10,000.00), both entries
  visible; over-credit guard; cross-tenant 403; parent IDOR (200 own child + full audit trail, 403
  cross-family on detail and list). **Checkpoint B** — refund: 2,000 advance → refund 2,000 →
  balance **exactly 0.00**, one `REFUND` debit entry, method+reference recorded; refund guard
  (zero available credit → rejected, nothing posts); write-off: owe 5,000 → write off 5,000 →
  balance **exactly 0.00**, one `WRITE_OFF` credit entry; both types proven to always stay
  `REQUESTED` regardless of amount (no threshold applies), accountant approve → 403, pending
  posts nothing, **rejected posts nothing** (proven once live — `reject()` is fully type-blind
  code, confirmed by inspection to hold identically for all three types); reversal of both an
  approved refund and an approved write-off returned balance to the exact prior value, both
  entries visible; cross-tenant probes on the new `/refunds` and `/write-offs` endpoints → 403;
  parent IDOR on both new correction types (200 rightful parent + audit trail, 403 cross-family);
  immutability trigger re-confirmed live on both a Checkpoint A and a Checkpoint B entry.
  **1093 api tests total (+46 across both checkpoints), `nest build` clean.** Tenant migration
  canary-applied to `demo` first, then rolled to all 8 tenants.

> Update this checklist as modules are completed.

---

## Session start instructions for Claude Code

When starting a new session, Claude Code should:
1. Read this CLAUDE.md fully
2. Read the relevant module spec from `docs/api-contracts/`
3. Check existing code in the target directory before writing anything new
4. Ask for clarification if the task conflicts with anything in this file

## Frontend (apps/web/) — added Session 11

Framework: Next.js 14 App Router + TypeScript
Styling: Tailwind CSS + shadcn/ui components
State: Zustand (global) + TanStack Query (server state)
Forms: React Hook Form + Zod
HTTP: Axios with interceptors (lib/api.ts)

### Frontend rules
- NEVER use localStorage for tokens — access token in Zustand memory only
- ALWAYS use the <BsDate> component for date display — never raw date strings
- ALWAYS use TanStack Query for API calls — never useEffect + fetch
- Forms use React Hook Form — never uncontrolled inputs
- ALL API response types must be in types/api.types.ts
- Tailwind only — no inline styles, no CSS modules
- shadcn/ui for all UI primitives (Button, Input, Table, Dialog, etc.)
  Install with: npx shadcn@latest add [component-name]

### Shared components to build in Session 11 (reused everywhere)
- <DataTable> — TanStack Table with sorting, filtering, pagination
- <BsDate> — date in BS format with AD tooltip
- <StatusBadge> — colored badge (PRESENT=green, ABSENT=red, etc.)
- <ConfirmDialog> — "Are you sure?" with confirm/cancel
- <PageHeader> — title + breadcrumb + action button slot
- <EmptyState> — illustration + message when list is empty


- Radix/base-ui Select with async data: never use <SelectValue> for async-loaded items.
  Use a computed <span> inside <SelectTrigger> that looks up name from data array directly.
- Response extraction rules:
    Paginated list → .data.data.data (ResponseInterceptor wraps, then {data:[], meta:{}})
    Simple list    → .data.data
- Academic year creation is always two steps: POST /academic-years → PATCH /:id/set-current
- Marks entry: load students from student API (names/rolls), marks from marks API (values), merge at display time