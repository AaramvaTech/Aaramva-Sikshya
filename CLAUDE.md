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

## Module build order (follow this sequence)

1. ✅ **Foundation** — Tenant resolution, Auth (JWT), RBAC, TenantPrismaService
2. ✅ **Student** — Admission, profiles, class assignment
3. ✅ **Academic** — Classes, sections, subjects, timetable
4. ✅ **Attendance** — Student and staff daily attendance
5. ✅ **Finance** — Fee structure, invoices, payments
6. ✅ **HR & Staff** — Staff profiles, leave, payroll
7. ✅ **Examination** — Exams, marks, report cards
8. ⬜ **E-Learning** — Assignments, materials, online classes
9. ✅ **Communication** — Notices, SMS, push notifications
10. ✅ **Library** — Books, issue/return, fines
11. ⬜ **Inventory** — Assets, stock
12. ✅ **Dashboard** — School dashboard (overview, weekly attendance, activity feed, upcoming exams, class-wise breakdown, quick actions)
13. ⬜ **Reports** — Analytics dashboards, exports
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

**Canonical brand color (mobile):** Aaramva primary is `#0B6B43` (`--primary: 11 107 67`), single source of truth in `apps/mobile/lib/theme/tokens.ts` (updated from `#065f46` to match the brand design). Auth + student screens read it only via the `--primary` token / `useThemeColors()` — never a second green literal. **Exception:** the pre-school onboarding flow (`app/index.tsx`) uses an exact-design literal palette (`OB` constant: `#0B6B43`/`#064E33` gradient, `#E9F4EE` band, etc.) plus the design logo assets `assets/images/aaramva-mark.png` + `aaramva-wordmark.png` (rendered untinted) — a documented exception, since onboarding is Aaramva-branded and must match the design pixel-for-pixel. Per-school themes override `--primary` at runtime (ThemeSync → applySchool). (Web's `#1a8055` reconciliation is out of scope.)

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
ESEWA_SECRET_KEY=
KHALTI_SECRET_KEY=
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

**Dev notes:**
- Prisma schema lives in `apps/api/prisma/` (not `packages/database/`) — pragmatic fix
  for a non-workspace monorepo; avoids Prisma generator output-location conflicts
- DB: PostgreSQL 17 local (password: <DB_PASSWORD — see .env>). Redis not running yet (needed for queues)
- Super Admin: AppModule.configure() registers TenantMiddleware with exclude for /api/v1/super-admin/(.*) AND /api/v1/tenants/verify/(.*). TenantModule no longer implements NestModule — middleware wired in AppModule only.
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
- **FIX-3 (open):** the bs-calendar `BS_MONTH_DATA` table is **one day off in the 2070 era**
  (authoritative: 1 Baisakh 2070 = 2013-04-14, 15 Bhadra 2070 = 2013-08-31; table yields one
  day earlier — verified vs nepalicalendar.rat32.com 2026-07-11). Modern era is CORRECT
  (27 Ashadh 2083 = 2026-07-11 confirmed). Epoch constant (`new Date(1943, 3, 12)`) also
  contradicts the package's own "13 April 1943" docstring. Fix = audit the table between 2000
  and ~2080 against authoritative anchors; affects historical dates (student dobs!) platform-wide.
  The 2070-era vectors in `date.util.spec.ts` deliberately key to the current table and must be
  updated with the table fix.
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