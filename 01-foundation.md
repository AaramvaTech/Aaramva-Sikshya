# Foundation Module — Claude Code Session 1 Spec

## Goal
Scaffold the entire project foundation: NestJS monorepo, Docker, Prisma (public schema),
tenant middleware, TenantPrismaService, JWT auth, and RBAC guards.

After this session, the system should:
- Resolve a school from its subdomain on every request
- Allow a school to register, and users to log in / refresh tokens
- Protect any route with `@Roles(Role.TEACHER)` style guards
- Have a working local dev environment via docker-compose

---

## Step 1 — Monorepo scaffold

```bash
# Run these commands in order
npx @nestjs/cli new api --package-manager npm --skip-git
cd api
npm install prisma @prisma/client
npm install @nestjs/jwt @nestjs/passport passport passport-jwt passport-local
npm install bcrypt class-validator class-transformer
npm install ioredis bullmq @nestjs/bullmq
npm install @types/bcrypt @types/passport-jwt --save-dev
npx prisma init
```

Project folder after scaffold:
```
apps/api/src/
├── app.module.ts
├── main.ts
└── modules/
    ├── auth/
    ├── tenant/
    └── common/
        ├── guards/
        ├── decorators/
        ├── interceptors/
        └── filters/
```

---

## Step 2 — docker-compose.yml (place in project root)

```yaml
version: '3.9'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: sms_user
      POSTGRES_PASSWORD: sms_pass
      POSTGRES_DB: sms_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

---

## Step 3 — Prisma schema (public schema only — no tenant tables yet)

File: `packages/database/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── PUBLIC SCHEMA (platform-level tables) ───────────────────────────────────

model Tenant {
  id           String   @id @default(uuid())
  name         String                          // "St. Xavier's School"
  slug         String   @unique               // "sxs" → sxs.yourdomain.com
  logoUrl      String?
  primaryColor String   @default("#2563EB")
  address      String?
  phone        String?
  email        String?
  panNumber    String?                         // Nepal PAN for IRD billing
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  deletedAt    DateTime?

  subscription Subscription?

  @@map("tenants")
}

model Plan {
  id            String   @id @default(uuid())
  name          String                          // "Basic", "Pro", "Enterprise"
  monthlyPrice  Decimal
  annualPrice   Decimal
  maxStudents   Int
  maxStaff      Int
  features      Json                            // { "elearning": true, "sms": false, ... }
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())

  subscriptions Subscription[]

  @@map("plans")
}

model Subscription {
  id          String             @id @default(uuid())
  tenantId    String             @unique
  planId      String
  status      SubscriptionStatus @default(TRIAL)
  trialEndsAt DateTime?
  startsAt    DateTime           @default(now())
  endsAt      DateTime?
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])
  plan   Plan   @relation(fields: [planId], references: [id])

  @@map("subscriptions")
}

enum SubscriptionStatus {
  TRIAL
  ACTIVE
  PAST_DUE
  CANCELLED
  EXPIRED
}
```

---

## Step 4 — Tenant schema template (run this SQL when a new school registers)

File: `apps/api/src/modules/tenant/tenant-schema.sql`

```sql
-- Called once per new school registration
-- Replace :schema with the tenant slug (e.g. tenant_sxs)

CREATE SCHEMA IF NOT EXISTS ":schema";

SET search_path TO ":schema";

-- Users table (lives inside tenant schema — each school's users are isolated)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'TEACHER',
  phone VARCHAR(20),
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Refresh tokens
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_users_email ON users(email);
```

---

## Step 5 — TenantMiddleware

File: `apps/api/src/modules/tenant/tenant.middleware.ts`

Behavior:
- Extract subdomain from `req.hostname` (e.g. `sxs` from `sxs.localhost`)
- For local dev, also check `X-Tenant-Slug` header as fallback
- Query the `tenants` table in public schema to find the tenant by slug
- If not found or inactive → throw `NotFoundException`
- Store `{ tenantId, tenantSlug, schemaName }` on `req.tenant`
- Use `AsyncLocalStorage` to make tenant context available anywhere without passing it through every function

```typescript
// The AsyncLocalStorage store shape
interface TenantContext {
  tenantId: string;
  slug: string;
  schemaName: string; // "tenant_sxs"
}
```

---

## Step 6 — TenantPrismaService

File: `apps/api/src/modules/tenant/tenant-prisma.service.ts`

This wraps PrismaClient and sets `search_path` to the current tenant's schema before every query.

```typescript
// Pseudocode — Claude Code will implement this properly
class TenantPrismaService {
  // Get current tenant from AsyncLocalStorage
  // Before each query: SET search_path TO tenant_<slug>, public
  // This means all Prisma queries automatically hit the right schema
}
```

Key requirement: Use Prisma's `$executeRaw` with `SET search_path` in a middleware or `$use` hook.

---

## Step 7 — Auth module

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/v1/auth/register-school | Public | Register new school + first admin user |
| POST | /api/v1/auth/login | Public | Login, returns access token + sets refresh cookie |
| POST | /api/v1/auth/refresh | Cookie | Refresh access token |
| POST | /api/v1/auth/logout | JWT | Invalidate refresh token |
| GET | /api/v1/auth/me | JWT | Get current user profile |

### Register school flow
1. Validate input (school name, slug, admin email, password)
2. Check slug is unique in `tenants` table
3. Create tenant record in `public.tenants`
4. Create subscription (TRIAL, 30 days)
5. Create tenant's Postgres schema using the SQL template
6. Create first user (SCHOOL_OWNER role) in `tenant_<slug>.users`
7. Return access token + school info

### DTOs needed

```typescript
// CreateSchoolDto
{
  schoolName: string;       // min 3, max 100
  slug: string;             // lowercase, alphanumeric + hyphens, min 3, max 30
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;       // valid email
  password: string;         // min 8, at least 1 number
  phone?: string;
  address?: string;
}

// LoginDto
{
  email: string;
  password: string;
}
```

### JWT strategy
- Access token payload: `{ sub: userId, email, role, tenantId, tenantSlug }`
- Access token expiry: `15m`
- Refresh token: UUID stored hashed in `refresh_tokens` table
- Refresh cookie: `httpOnly: true, secure: true, sameSite: 'strict', maxAge: 7d`

---

## Step 8 — RBAC

File: `apps/api/src/modules/common/guards/roles.guard.ts`

```typescript
// Role enum
export enum Role {
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  SCHOOL_OWNER = 'SCHOOL_OWNER',
  PRINCIPAL = 'PRINCIPAL',
  ACADEMIC_COORDINATOR = 'ACADEMIC_COORDINATOR',
  ACCOUNTANT = 'ACCOUNTANT',
  LIBRARIAN = 'LIBRARIAN',
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT',
  PARENT = 'PARENT',
}

// Usage on controllers:
@Roles(Role.PRINCIPAL, Role.SCHOOL_OWNER)
@UseGuards(JwtAuthGuard, RolesGuard)
@Get('reports')
getReports() { ... }
```

Also create a `@CurrentUser()` decorator that pulls the user from `req.user`.

---

## Step 9 — Global response interceptor + exception filter

### ResponseInterceptor
Wraps all successful responses in:
```json
{ "success": true, "data": <original response>, "meta": null }
```

### HttpExceptionFilter
Catches all exceptions and returns:
```json
{ "success": false, "error": { "code": "NOT_FOUND", "message": "Tenant not found", "details": null } }
```

---

## Step 10 — main.ts configuration

```typescript
// Must include:
app.setGlobalPrefix('api/v1');
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
app.useGlobalInterceptors(new ResponseInterceptor());
app.useGlobalFilters(new HttpExceptionFilter());
app.enableCors({ origin: process.env.ALLOWED_ORIGINS?.split(','), credentials: true });
app.use(cookieParser());
```

---

## Tests to write

For `AuthService`:
- `register()` creates tenant schema + user successfully
- `register()` throws if slug already taken
- `login()` returns tokens for valid credentials
- `login()` throws for wrong password
- `refresh()` returns new access token for valid refresh token
- `refresh()` throws for expired/invalid token

For `TenantMiddleware`:
- Resolves tenant from subdomain correctly
- Throws 404 for unknown subdomain
- Falls back to X-Tenant-Slug header in dev mode

---

## Exact prompt to paste into Claude Code (CLI)

```
Read CLAUDE.md fully first.

Then read docs/api-contracts/01-foundation.md.

Your task: Build the complete foundation layer as described in that spec.

Start in this order:
1. Set up the folder structure under apps/api/src/
2. Create docker-compose.yml in the root
3. Write the Prisma schema (public schema only — tenants, plans, subscriptions)
4. Implement TenantMiddleware using AsyncLocalStorage
5. Implement TenantPrismaService with search_path switching
6. Build the Auth module (register-school, login, refresh, logout, me)
7. Build Role enum + RolesGuard + @CurrentUser decorator
8. Add ResponseInterceptor and HttpExceptionFilter
9. Configure main.ts
10. Write unit tests for AuthService and TenantMiddleware

After each step, tell me what you built and what comes next.
Do NOT move to the next step without completing the current one.
Follow all conventions in CLAUDE.md exactly.
```
