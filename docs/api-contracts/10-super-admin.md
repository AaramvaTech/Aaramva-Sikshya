# Super Admin Module — Claude Code Session 10 Spec
# Aaramva Shikshya

## Prerequisites
- Sessions 0–9 complete, 148 tests passing
- public schema: tenants, plans, subscriptions tables exist (from Session 1)
- All tenant modules complete

## Goal
Build the Super Admin module — the platform-level control panel that
the Aaramva Shikshya owner (you, Srijan) uses to:
- Manage all schools on the platform
- Create and manage subscription plans
- View platform-wide analytics
- Onboard new schools manually (beyond self-registration)
- Impersonate a school for support purposes
- View global SMS and error logs

This module operates on the PUBLIC schema (tenants, plans, subscriptions)
NOT on any tenant schema. It's the one module that doesn't use TenantPrismaService.
It uses a dedicated PublicPrismaService instead.

---

## CRITICAL — Public schema vs Tenant schema

Every other module uses TenantPrismaService (sets search_path to tenant schema).
This module uses PublicPrismaService (search_path = public).

PublicPrismaService must already exist from Session 1 — it's just PrismaService
pointed at the public schema. If it doesn't exist, create it:

```typescript
// apps/api/src/modules/super-admin/public-prisma.service.ts
// This is a wrapper that always queries the public schema
// No tenant context needed — this is platform-level data
@Injectable()
export class PublicPrismaService {
  constructor(private readonly prisma: PrismaService) {}

  async query<T>(sql: string, params: any[] = []): Promise<T[]> {
    // SET search_path = public before every query
    await this.prisma.$executeRawUnsafe('SET search_path = public');
    return this.prisma.$queryRawUnsafe(sql, ...params);
  }

  async execute(sql: string, params: any[] = []): Promise<void> {
    await this.prisma.$executeRawUnsafe('SET search_path = public');
    await this.prisma.$executeRawUnsafe(sql, ...params);
  }
}
```

---

## Super Admin auth — separate from tenant auth

Super admin users are NOT stored in any tenant schema.
They are stored in the PUBLIC schema in a `platform_admins` table.

When a PLATFORM_ADMIN logs in:
- They hit a different endpoint: `POST /api/v1/super-admin/auth/login`
- Their JWT contains: `{ sub, email, role: 'PLATFORM_ADMIN', tenantId: null }`
- They are guarded by `@Roles(Role.PLATFORM_ADMIN)` on all super-admin endpoints
- The TenantMiddleware must skip tenant resolution for `/super-admin/` routes

---

## Database — add to PUBLIC schema (different from tenant-schema.sql)

Create a new file: `apps/api/src/database/public-schema.sql`
This is run ONCE at platform setup (not per tenant).

```sql
-- Run in public schema

-- Platform admins (separate from tenant users)
CREATE TABLE IF NOT EXISTS platform_admins (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name    VARCHAR(100) NOT NULL,
  last_name     VARCHAR(100) NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Subscription plans (already exists from Session 1 — ensure it matches)
CREATE TABLE IF NOT EXISTS plans (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(50) NOT NULL UNIQUE,  -- "Trial", "Basic", "Pro", "Enterprise"
  monthly_price NUMERIC(10,2) NOT NULL,
  annual_price  NUMERIC(10,2) NOT NULL,
  max_students  INT         NOT NULL,
  max_staff     INT         NOT NULL,
  features      JSONB       NOT NULL DEFAULT '{}',
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tenants (already exists from Session 1 — ensure it matches)
CREATE TABLE IF NOT EXISTS tenants (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(200) NOT NULL,
  slug          VARCHAR(50) NOT NULL UNIQUE,
  logo_url      TEXT,
  primary_color VARCHAR(7)  NOT NULL DEFAULT '#2563EB',
  address       TEXT,
  phone         VARCHAR(20),
  email         VARCHAR(255),
  pan_number    VARCHAR(20),
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

-- Subscriptions (already exists from Session 1 — ensure it matches)
CREATE TABLE IF NOT EXISTS subscriptions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL UNIQUE REFERENCES tenants(id),
  plan_id         UUID        NOT NULL REFERENCES plans(id),
  status          VARCHAR(20) NOT NULL DEFAULT 'TRIAL',
                  -- TRIAL | ACTIVE | PAST_DUE | CANCELLED | EXPIRED
  trial_ends_at   TIMESTAMPTZ,
  starts_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Platform-level audit log
CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID        NOT NULL REFERENCES platform_admins(id),
  action      VARCHAR(100) NOT NULL,   -- 'TENANT_CREATED', 'PLAN_CHANGED', etc.
  target_type VARCHAR(50),             -- 'TENANT', 'PLAN', 'SUBSCRIPTION'
  target_id   UUID,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the default plans
INSERT INTO plans (name, monthly_price, annual_price, max_students, max_staff, features)
VALUES
  ('Trial',      0,     0,     100,  10,  '{"sms":false,"elearning":false,"reports":true}'),
  ('Basic',      999,   9990,  500,  50,  '{"sms":true,"elearning":false,"reports":true}'),
  ('Pro',        2499,  24990, 2000, 200, '{"sms":true,"elearning":true,"reports":true}'),
  ('Enterprise', 4999,  49990, 99999,9999,'{"sms":true,"elearning":true,"reports":true,"api":true}')
ON CONFLICT (name) DO NOTHING;

-- Seed the first platform admin (change email/password before going live)
-- Password: Admin@1234 (bcrypt hash — run: node -e "require('bcrypt').hash('Admin@1234',10).then(console.log)")
-- Replace the hash below with a fresh one
INSERT INTO platform_admins (email, first_name, last_name, password_hash)
VALUES ('admin@aaramvashikshya.com', 'Srijan', 'Pradhan', '$REPLACE_WITH_FRESH_BCRYPT_HASH')
ON CONFLICT (email) DO NOTHING;
```

---

## API Endpoints

All routes prefixed with `/api/v1/super-admin/`
All require `@Roles(Role.PLATFORM_ADMIN)` guard.
TenantMiddleware must be skipped for these routes (check X-Skip-Tenant header or path prefix).

### Auth (public — no PLATFORM_ADMIN guard needed)
| Method | Path | Notes |
|--------|------|-------|
| POST | /super-admin/auth/login | Platform admin login |
| POST | /super-admin/auth/logout | Invalidate token |

### Plans
| Method | Path | Notes |
|--------|------|-------|
| POST | /super-admin/plans | Create plan |
| GET | /super-admin/plans | List all plans |
| PATCH | /super-admin/plans/:id | Update plan |
| DELETE | /super-admin/plans/:id | Deactivate plan (never hard delete) |

### Tenants (Schools)
| Method | Path | Notes |
|--------|------|-------|
| POST | /super-admin/tenants | Manually onboard a school |
| GET | /super-admin/tenants | List all schools (paginated) |
| GET | /super-admin/tenants/:id | School detail + subscription + usage stats |
| PATCH | /super-admin/tenants/:id | Update school info |
| PATCH | /super-admin/tenants/:id/activate | Re-activate suspended school |
| PATCH | /super-admin/tenants/:id/suspend | Suspend school (sets is_active=false) |

### Subscriptions
| Method | Path | Notes |
|--------|------|-------|
| PATCH | /super-admin/tenants/:id/subscription | Change plan / extend / cancel |

### Platform Analytics
| Method | Path | Notes |
|--------|------|-------|
| GET | /super-admin/analytics/overview | Platform-wide stats |
| GET | /super-admin/analytics/revenue | Revenue by month (subscription billing) |

### Support tools
| Method | Path | Notes |
|--------|------|-------|
| POST | /super-admin/tenants/:id/impersonate | Get a SCHOOL_OWNER JWT for a tenant (support use) |
| GET | /super-admin/audit-logs | Platform audit log |

---

## Key DTOs

```typescript
// PlatformLoginDto
{
  email: string;
  password: string;
}

// CreatePlanDto
{
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  maxStudents: number;
  maxStaff: number;
  features: Record<string, boolean>;
}

// ManualOnboardTenantDto
{
  schoolName: string;
  slug: string;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  adminPassword: string;
  planId: string;
  phone?: string;
  address?: string;
  panNumber?: string;
  trialDays?: number;   // default 30
}

// UpdateSubscriptionDto
{
  planId?: string;
  status?: 'ACTIVE' | 'CANCELLED' | 'EXPIRED';
  endsAt?: string;      // extend expiry (AD datetime)
}
```

---

## Business logic rules

### 1. Skip TenantMiddleware for super-admin routes
In `apps/api/src/main.ts` or `app.module.ts`, the TenantMiddleware must
exclude paths starting with `/api/v1/super-admin/`.

```typescript
// In AppModule configure():
consumer
  .apply(TenantMiddleware)
  .exclude({ path: 'api/v1/super-admin/(.*)', method: RequestMethod.ALL })
  .forRoutes('*');
```

### 2. Platform admin login — separate flow
Platform admins log in via their own endpoint and get a JWT with:
`{ sub: adminId, email, role: 'PLATFORM_ADMIN', tenantId: null }`

The existing `JwtStrategy` can handle this token as long as it doesn't
require a `tenantId`. Update JwtStrategy to allow `tenantId: null`.

### 3. Manual tenant onboarding
Reuse the same logic as `POST /api/v1/auth/register-school` but called
from super-admin context. Create a `TenantProvisioningService` that
both registration and super-admin onboarding call. It should:
1. Validate slug uniqueness
2. Create tenant in public.tenants
3. Create subscription with chosen plan
4. Create tenant's PostgreSQL schema
5. Create SCHOOL_OWNER user in tenant schema
6. Log to platform_audit_logs

### 4. Impersonation token
```typescript
// POST /super-admin/tenants/:id/impersonate
// Returns a short-lived (1 hour) JWT for the SCHOOL_OWNER of that tenant
// This lets support staff log in as the school to debug issues
// MUST log to platform_audit_logs:
// { action: 'IMPERSONATION', targetType: 'TENANT', targetId, details: { adminId, adminEmail } }
{
  accessToken: string,         // 1 hour expiry
  tenantSlug: string,
  schoolName: string,
  warning: "This token grants SCHOOL_OWNER access. All actions are audited."
}
```

### 5. Platform analytics overview
```typescript
{
  asOf: { ad, bs },
  totals: {
    schools: number,           // total tenants
    activeSchools: number,     // is_active = true
    trialSchools: number,      // subscription.status = TRIAL
    suspendedSchools: number,  // is_active = false
  },
  subscriptions: {
    trial: number,
    basic: number,
    pro: number,
    enterprise: number,
  },
  recentOnboarding: {          // last 5 schools registered
    id, name, slug, createdAt, planName
  }[]
}
```

### 6. Suspend school
```
UPDATE tenants SET is_active = false WHERE id = tenantId
-- This causes TenantMiddleware to throw 403 for all requests from that school
-- The middleware already checks is_active
```

### 7. Audit logging
Every mutating super-admin action must insert into `platform_audit_logs`.
Create an `AuditService` with a `log(adminId, action, targetType, targetId, details)` method.
Call it after every: tenant create, suspend, activate, plan change, impersonation.

---

## Tests to write

```typescript
// PlatformAuthService
- login returns JWT with role PLATFORM_ADMIN and tenantId null
- login throws for wrong password

// PlanService
- createPlan creates record
- updatePlan updates features JSONB correctly
- deactivatePlan sets is_active=false (does not delete)

// TenantAdminService
- onboardTenant creates tenant + subscription + schema + owner user
- onboardTenant throws ConflictException if slug taken
- suspendTenant sets is_active=false
- activateTenant sets is_active=true

// ImpersonationService
- impersonate returns 1-hour JWT with SCHOOL_OWNER role
- impersonate logs action to platform_audit_logs
- impersonate throws if tenant not found

// AnalyticsService
- getOverview returns correct counts (mock DB results)
```

---

## Exact prompt for Claude Code

```
Read CLAUDE.md in full. Confirm you have read it.
Then read docs/api-contracts/10-super-admin.md in full.

Sessions 0–9 complete. 148 tests passing.
All tenant modules are done. This is the final backend session.

Session 10 task: Build the Super Admin module.

IMPORTANT: This module operates on the PUBLIC schema, not tenant schemas.
It uses PublicPrismaService (not TenantPrismaService).

Work in this exact order:

1. Create apps/api/src/database/public-schema.sql with the platform tables.
   Ensure it includes: platform_admins, plans (with seed data), tenants,
   subscriptions, platform_audit_logs.

2. Create PublicPrismaService — wraps PrismaService, always sets search_path=public.

3. Update TenantMiddleware to SKIP resolution for paths starting with
   /api/v1/super-admin/ (use the exclude pattern in AppModule).

4. Update JwtStrategy to allow tenantId: null in JWT payload
   (platform admins have no tenant).

5. Create TenantProvisioningService — extracted from the existing
   auth/register-school flow. Both self-registration AND super-admin
   onboarding will call this service.
   Refactor AuthService.registerSchool() to use TenantProvisioningService.

6. Build PlatformAuthService:
   - login() — checks platform_admins table, returns JWT with PLATFORM_ADMIN role
   - logout() — invalidate token (add to a simple blocklist in Redis, or just
     return success since JWTs are short-lived)

7. Build PlanService — CRUD on public.plans.

8. Build TenantAdminService:
   - onboardTenant() — uses TenantProvisioningService
   - suspendTenant() / activateTenant()
   - getTenantDetail() — tenant + subscription + stats (student count, staff count
     from tenant schema)
   - listTenants() — paginated, filterable by status/plan

9. Build AuditService — log() method inserts into platform_audit_logs.

10. Build ImpersonationService:
    - impersonate() — find SCHOOL_OWNER user in tenant schema, generate 1h JWT
    - Log to audit_logs before returning token

11. Build AnalyticsService — getOverview(), basic revenue aggregation.

12. Wire SuperAdminController — all endpoints.
    All except /super-admin/auth/login require @Roles(Role.PLATFORM_ADMIN).

13. Write all tests. Run full suite.
    Target: 148 existing + ~11 new = 159+ passing.

Rules:
- PublicPrismaService for all super-admin DB queries (NOT TenantPrismaService)
- All dates: return { ad, bs }
- Standard response format
- Every controller method (except login) needs @Roles(Role.PLATFORM_ADMIN)
- Every mutating action must call AuditService.log()
```

---

## After Session 10 — what's next

Once Session 10 is complete, the ENTIRE NestJS backend is done.

Session 11 will start the Next.js web frontend (admin portal).
Before Session 11, come back to Claude.ai — we will plan the
frontend architecture, design the folder structure, and write
the Next.js CLAUDE.md addendum together.

The frontend will cover:
- Login page (tenant subdomain-aware)
- Super admin dashboard
- School admin dashboard
- Student management UI
- Attendance marking UI
- Fee collection UI
- Report cards

---

## Learning checkpoint for Session 10

After this session, you should be able to answer:
- Why does the super admin module use PublicPrismaService instead of TenantPrismaService?
- What is impersonation and why must it be audited?
- Why do we extract TenantProvisioningService instead of duplicating code?
- What does it mean to "suspend" a school at the middleware level?
