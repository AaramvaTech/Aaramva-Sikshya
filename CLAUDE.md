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
| Mobile | React Native + Expo | Student app, Parent app, Teacher (Guru) app |
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
- JWT refresh token: 7 days, stored in httpOnly cookie
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
2. ⬜ **Student** — Admission, profiles, class assignment
3. ⬜ **Academic** — Classes, sections, subjects, timetable
4. ⬜ **Attendance** — Student and staff daily attendance
5. ⬜ **Finance** — Fee structure, invoices, payments
6. ⬜ **HR & Staff** — Staff profiles, leave, payroll
7. ⬜ **Examination** — Exams, marks, report cards
8. ⬜ **E-Learning** — Assignments, materials, online classes
9. ⬜ **Communication** — Notices, SMS, push notifications
10. ⬜ **Library** — Books, issue/return, fines
11. ⬜ **Inventory** — Assets, stock
12. ⬜ **Reports** — Analytics dashboards, exports
13. ⬜ **Super Admin** — Platform-level school management

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

**Dev notes:**
- Prisma schema lives in `apps/api/prisma/` (not `packages/database/`) — pragmatic fix
  for a non-workspace monorepo; avoids Prisma generator output-location conflicts
- DB: PostgreSQL 17 local (password: <REDACTED>). Redis not running yet (needed for queues)
- Run migrations: `cd apps/api && npx prisma migrate dev`
- Run tests: `cd apps/api && npm test`

> Update this checklist as modules are completed.

---

## Session start instructions for Claude Code

When starting a new session, Claude Code should:
1. Read this CLAUDE.md fully
2. Read the relevant module spec from `docs/api-contracts/`
3. Check existing code in the target directory before writing anything new
4. Ask for clarification if the task conflicts with anything in this file
