# Frontend Session 17 — Super Admin Portal UI
# Aaramva Shikshya

## Prerequisites
- Sessions 11–16 complete — all school-level UI done
- Backend Session 10 complete — super admin API working
- Super admin login endpoint: POST /super-admin/auth/login
- Super admin JWT has role: 'PLATFORM_ADMIN', tenantId: null

## Goal
Build the Super Admin portal — the platform control panel that
Srijan uses to manage all schools on Aaramva Shikshya.

This portal lives at a different URL from the school portal.
In production: platform.aaramvashikshya.com
In dev: localhost:3000?tenant=platform (or a separate port)

The super admin portal is completely separate from the school UI:
- Different login page
- Different layout (no school sidebar)
- Different auth store logic (tenantId is null)
- All API calls go to /super-admin/* endpoints

---

## Routing strategy

The super admin portal reuses the same Next.js app but with
a separate route group:

```
app/
├── (auth)/login/page.tsx          ← school login (already built)
├── (super-admin)/
│   ├── layout.tsx                 ← super admin shell
│   ├── login/page.tsx             ← platform admin login
│   ├── dashboard/page.tsx         ← platform overview
│   ├── schools/
│   │   ├── page.tsx               ← all schools list
│   │   └── [id]/page.tsx          ← school detail
│   └── plans/page.tsx             ← subscription plans
└── (school)/...                   ← existing school portal
```

In middleware.ts, detect if subdomain is 'platform' and rewrite
to /super-admin routes. For dev, use ?superadmin=true query param
as a toggle.

---

## Super Admin API functions

File: `lib/api/super-admin.api.ts`

```typescript
export const superAdminApi = {
  // Auth
  login: (data: { email: string; password: string }) =>
    api.post<ApiResponse<{ accessToken: string; admin: PlatformAdmin }>>(
      '/super-admin/auth/login', data
    ),
  logout: () => api.post('/super-admin/auth/logout'),

  // Analytics
  getOverview: () =>
    api.get<ApiResponse<PlatformOverview>>('/super-admin/analytics/overview'),

  // Plans
  listPlans: () =>
    api.get<ApiResponse<SubscriptionPlan[]>>('/super-admin/plans'),
  createPlan: (data: CreatePlanData) =>
    api.post<ApiResponse<SubscriptionPlan>>('/super-admin/plans', data),
  updatePlan: (id: string, data: Partial<CreatePlanData>) =>
    api.patch<ApiResponse<SubscriptionPlan>>(`/super-admin/plans/${id}`, data),
  deactivatePlan: (id: string) =>
    api.delete(`/super-admin/plans/${id}`),

  // Tenants (schools)
  listTenants: (params?: {
    page?: number; limit?: number; search?: string;
    status?: 'active' | 'suspended'; planId?: string;
  }) => api.get<ApiResponse<PaginatedResponse<TenantSummary>>>(
    '/super-admin/tenants', { params }
  ),
  getTenant: (id: string) =>
    api.get<ApiResponse<TenantDetail>>(`/super-admin/tenants/${id}`),
  onboardTenant: (data: OnboardTenantData) =>
    api.post<ApiResponse<TenantDetail>>('/super-admin/tenants', data),
  updateTenant: (id: string, data: Partial<OnboardTenantData>) =>
    api.patch<ApiResponse<TenantDetail>>(`/super-admin/tenants/${id}`, data),
  suspendTenant: (id: string) =>
    api.patch(`/super-admin/tenants/${id}/suspend`, {}),
  activateTenant: (id: string) =>
    api.patch(`/super-admin/tenants/${id}/activate`, {}),

  // Subscription
  updateSubscription: (tenantId: string, data: {
    planId?: string;
    status?: string;
    endsAt?: string;
  }) => api.patch(`/super-admin/tenants/${tenantId}/subscription`, data),

  // Impersonation
  impersonate: (tenantId: string) =>
    api.post<ApiResponse<ImpersonationToken>>(`/super-admin/tenants/${tenantId}/impersonate`, {}),

  // Audit logs
  getAuditLogs: (params?: { page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<AuditLog>>>('/super-admin/audit-logs', { params }),
};
```

---

## Types

```typescript
export interface PlatformAdmin {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface PlatformOverview {
  asOf: { ad: string; bs: string };
  totals: {
    schools: number;
    activeSchools: number;
    trialSchools: number;
    suspendedSchools: number;
  };
  subscriptions: {
    trial: number;
    basic: number;
    pro: number;
    enterprise: number;
  };
  recentOnboarding: {
    id: string; name: string; slug: string;
    createdAt: string; planName: string;
  }[];
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  maxStudents: number;
  maxStaff: number;
  features: Record<string, boolean>;
  isActive: boolean;
}

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  planName: string;
  subscriptionStatus: string;
  studentCount: number;
  staffCount: number;
}

export interface TenantDetail extends TenantSummary {
  email: string | null;
  phone: string | null;
  address: string | null;
  panNumber: string | null;
  logoUrl: string | null;
  primaryColor: string;
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
  planId: string;
}

export interface ImpersonationToken {
  accessToken: string;
  tenantSlug: string;
  schoolName: string;
  warning: string;
}

export interface AuditLog {
  id: string;
  adminEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface OnboardTenantData {
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
  trialDays?: number;
}

export interface CreatePlanData {
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  maxStudents: number;
  maxStaff: number;
  features: Record<string, boolean>;
}
```

---

## Super Admin Shell Layout

File: `app/(super-admin)/layout.tsx`

Different from school layout — simpler, no tenant context needed:

```
┌───────────────────────────────────────────────────────┐
│  🏫 Aaramva Shikshya  |  Platform Admin  |  [Logout]  │
├──────────┬────────────────────────────────────────────┤
│          │                                             │
│ Overview │   PAGE CONTENT                              │
│ Schools  │                                             │
│ Plans    │                                             │
│ Audit    │                                             │
│          │                                             │
└──────────┴────────────────────────────────────────────┘
```

Sidebar items (4 only):
- Overview → /super-admin/dashboard
- Schools → /super-admin/schools
- Plans → /super-admin/plans
- Audit Log → /super-admin/audit

Auth guard: check for PLATFORM_ADMIN role in auth store.
If not PLATFORM_ADMIN → redirect to /super-admin/login.

---

## Pages to build

### 1. Super Admin Login — `app/(super-admin)/login/page.tsx`

Similar to school login but simpler (no school code field):
```
Aaramva Shikshya
Platform Administration

Email*    [________________________]
Password* [________________________]
          [Sign In as Platform Admin]
```

On success: store token in auth store (same Zustand store, role will be PLATFORM_ADMIN).
Redirect to /super-admin/dashboard.

Uses: `superAdminApi.login()` (different endpoint from school login).

---

### 2. Platform Dashboard — `app/(super-admin)/dashboard/page.tsx`

```
<PageHeader title="Platform Overview" description="Aaramva Shikshya — Admin Console" />

Row 1 — 4 stat cards:
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Total Schools│ │Active Schools│ │ On Trial     │ │ Suspended    │
│     47       │ │     39       │ │     6        │ │     2        │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

Row 2 — 4 plan breakdown cards:
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│  Trial   │ │  Basic   │ │   Pro    │ │Enterprise│
│    6     │ │   18     │ │   19     │ │    4     │
└──────────┘ └──────────┘ └──────────┘ └──────────┘

Row 3 — Recent onboarding:
"Recently Joined Schools"
Table: Name | Slug | Plan | Joined Date
(last 5 schools)
```

---

### 3. Schools List — `app/(super-admin)/schools/page.tsx`

```
<PageHeader title="Schools" action={<Button>+ Onboard School</Button>} />

[Search by name/slug]  [Plan ▼]  [Status ▼]

DataTable columns:
School Name | Slug | Plan | Status | Students | Staff | Joined | Actions

Actions per row:
- View → /super-admin/schools/[id]
- Suspend (if active) → ConfirmDialog → suspendTenant()
- Activate (if suspended) → activateTenant()
- Impersonate → ConfirmDialog with warning → impersonate()
```

**Impersonation flow:**
1. Admin clicks "Impersonate"
2. ConfirmDialog: "You are about to access [School Name] as SCHOOL_OWNER.
   All actions will be audited. Continue?"
3. On confirm: call `superAdminApi.impersonate(tenantId)`
4. Store the returned `accessToken` in auth store
5. Set tenantSlug in tenant store
6. Open school portal in NEW TAB: `window.open('/?tenant=' + tenantSlug)`
7. Show toast: "Impersonation active — all actions audited"

Note: The impersonation token is a real JWT — opening the school portal
with it in the auth store gives full SCHOOL_OWNER access.

**Onboard school form** (dialog):
Multi-field form:
```
School Name*      [_________________________]
School Code/Slug* [_________________________]  (auto-suggest from name)
Plan*             [Trial ▼]
Admin Email*      [_________________________]
Admin First Name* [_________________________]
Admin Last Name*  [_________________________]
Admin Password*   [_________________________]
Phone             [_________________________]
Address           [_________________________]
Trial Days        [30] (if plan = Trial)
```

Slug auto-suggest: as user types school name, generate slug:
```typescript
const suggestSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 30);
```
User can override the suggestion.

---

### 4. School Detail — `app/(super-admin)/schools/[id]/page.tsx`

```
<PageHeader
  title={school.name}
  description={`${school.slug}.aaramvashikshya.com`}
  action={<Button variant="outline">Impersonate</Button>}
/>

Two columns:
Left — School Info card:
  Name, Slug, Email, Phone, Address, PAN, Primary Color
  [Edit] button → inline edit form

Right — Subscription card:
  Plan: Pro
  Status: ACTIVE (green badge)
  Started: 1 Baisakh 2081
  Expires: 30 Chaitra 2081
  [Change Plan ▼]  [Suspend School]

Below — Usage stats:
  Students: 342  |  Staff: 28  |  (from tenant detail stats)

Below — Subscription history (future, static for now):
  "Subscription management coming soon"
```

Change Plan: select dropdown → calls updateSubscription().
Suspend/Activate: ConfirmDialog.

---

### 5. Plans Management — `app/(super-admin)/plans/page.tsx`

```
<PageHeader title="Subscription Plans" action={<Button>+ Create Plan</Button>} />

Cards for each plan (not a table — plans have rich feature sets):
┌─────────────────────────────────────────┐
│ Pro Plan                      ACTIVE    │
│ Rs. 2,499/month | Rs. 24,990/year       │
│ Up to 2,000 students | 200 staff        │
│                                         │
│ Features:                               │
│ ✓ SMS Notifications                     │
│ ✓ E-Learning                           │
│ ✓ Advanced Reports                      │
│ ✗ API Access                           │
│                                         │
│ 19 schools on this plan                 │
│ [Edit] [Deactivate]                     │
└─────────────────────────────────────────┘
```

Edit plan: dialog with all fields.
Deactivate: ConfirmDialog ("Schools on this plan will not be affected,
but no new schools can subscribe to it.").

Create plan dialog:
```
Name*           [___________]
Monthly Price*  [Rs. _______]
Annual Price*   [Rs. _______]
Max Students*   [_________]
Max Staff*      [_________]
Features:
  [ ] SMS Notifications
  [ ] E-Learning
  [ ] Advanced Reports
  [ ] API Access
```

---

### 6. Audit Log — `app/(super-admin)/audit/page.tsx`

```
<PageHeader title="Audit Log" />

DataTable (read-only, no actions):
Admin | Action | Target | Details | Time

Action badge colors:
TENANT_CREATED    → green
TENANT_SUSPENDED  → red
TENANT_ACTIVATED  → blue
PLAN_CHANGED      → yellow
IMPERSONATION     → orange (bold — security-sensitive)
```

Impersonation rows highlighted in orange background — these are
the most sensitive actions.

---

## Zod schemas

```typescript
// lib/schemas/super-admin.schema.ts

export const superAdminLoginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

export const onboardTenantSchema = z.object({
  schoolName: z.string().min(3).max(200),
  slug: z.string().min(3).max(30).regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, hyphens'),
  planId: z.string().uuid(),
  adminEmail: z.string().email(),
  adminFirstName: z.string().min(1),
  adminLastName: z.string().min(1),
  adminPassword: z.string().min(8),
  phone: z.string().optional(),
  address: z.string().optional(),
  trialDays: z.number().int().min(1).max(90).optional(),
});

export const createPlanSchema = z.object({
  name: z.string().min(2).max(50),
  monthlyPrice: z.number().min(0),
  annualPrice: z.number().min(0),
  maxStudents: z.number().int().min(1),
  maxStaff: z.number().int().min(1),
  features: z.record(z.boolean()),
});
```

---

## TanStack Query hooks

```typescript
// lib/hooks/use-super-admin.ts

export function usePlatformOverview() {
  return useQuery({
    queryKey: ['platform', 'overview'],
    queryFn: () => superAdminApi.getOverview().then(r => r.data.data),
    refetchInterval: 5 * 60 * 1000,  // refresh every 5 min
  });
}

export function useTenants(params) {
  return useQuery({
    queryKey: ['platform', 'tenants', params],
    queryFn: () => superAdminApi.listTenants(params).then(r => r.data.data),
  });
}

export function useTenant(id: string) {
  return useQuery({
    queryKey: ['platform', 'tenant', id],
    queryFn: () => superAdminApi.getTenant(id).then(r => r.data.data),
    enabled: !!id,
  });
}

export function useOnboardTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: superAdminApi.onboardTenant,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform', 'tenants'] }),
  });
}

export function useSuspendTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: superAdminApi.suspendTenant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'tenants'] });
      queryClient.invalidateQueries({ queryKey: ['platform', 'overview'] });
    },
  });
}

export function useImpersonate() {
  return useMutation({ mutationFn: superAdminApi.impersonate });
}

export function usePlans() {
  return useQuery({
    queryKey: ['platform', 'plans'],
    queryFn: () => superAdminApi.listPlans().then(r => r.data.data),
  });
}

export function useAuditLogs(params) {
  return useQuery({
    queryKey: ['platform', 'audit-logs', params],
    queryFn: () => superAdminApi.getAuditLogs(params).then(r => r.data.data),
  });
}
```

---

## Exact prompt for Claude Code

```
Read CLAUDE.md in full.
Then read docs/api-contracts/17-super-admin-ui.md in full.

Sessions 11–16 complete. All school-level UI done.
This is the final frontend session — the Super Admin portal.

The super admin portal is a SEPARATE section of the app:
- Route group: app/(super-admin)/
- Different login: /super-admin/login
- Different layout: simpler shell, 4 nav items only
- Auth: same Zustand store, but role = PLATFORM_ADMIN

Work in this order:

1. Add super admin types to types/api.types.ts:
   PlatformAdmin, PlatformOverview, SubscriptionPlan, TenantSummary,
   TenantDetail, ImpersonationToken, AuditLog, OnboardTenantData, CreatePlanData

2. Create lib/api/super-admin.api.ts

3. Create lib/hooks/use-super-admin.ts with 8 hooks

4. Create lib/schemas/super-admin.schema.ts with 3 Zod schemas

5. Build app/(super-admin)/layout.tsx:
   - Simple sidebar (4 items: Overview, Schools, Plans, Audit)
   - Header with "Platform Admin" label + logout
   - Auth guard: redirect to /super-admin/login if role !== PLATFORM_ADMIN

6. Build app/(super-admin)/login/page.tsx:
   - Email + Password only (no school code)
   - Calls superAdminApi.login()
   - On success: store token, redirect to /super-admin/dashboard

7. Build app/(super-admin)/dashboard/page.tsx:
   - usePlatformOverview() with 5-min refetch
   - 4 school stat cards + 4 plan breakdown cards
   - Recent onboarding table (last 5 schools)

8. Build app/(super-admin)/schools/page.tsx:
   - DataTable with search/plan/status filters
   - Onboard School dialog (full form with slug auto-suggest)
   - Suspend/Activate actions with ConfirmDialog
   - Impersonate action: ConfirmDialog → call impersonate() →
     store token → window.open school portal in new tab

9. Build app/(super-admin)/schools/[id]/page.tsx:
   - Two-column layout: school info + subscription card
   - Usage stats (student/staff count)
   - Change plan dropdown
   - Suspend/Activate + Impersonate buttons

10. Build app/(super-admin)/plans/page.tsx:
    - Plan cards with feature checkmarks
    - Create plan dialog with feature toggles
    - Edit + Deactivate actions

11. Build app/(super-admin)/audit/page.tsx:
    - Read-only DataTable
    - Impersonation rows highlighted in orange

Frontend rules (always):
- Same rules as school portal
- Impersonation: always requires ConfirmDialog with warning text
- Audit log: read-only, no mutations
- Super admin login uses /super-admin/auth/login endpoint
- Slug auto-suggest updates as school name is typed
```

---

## After Session 17 — what comes next

Session 17 completes the entire web frontend.

What remains for a production launch:
1. Deployment setup (Docker + cloud hosting)
2. Domain configuration (subdomains)
3. Environment variables for production
4. React Native mobile app (Session 18+)
5. End-to-end testing with real school data
6. Payment gateway integration (eSewa/Khalti)

After Session 17 — come back to Claude.ai and we will plan
the deployment strategy together.

---

## Learning checkpoint for Session 17

After this session, you should be able to answer:
- What is impersonation and why does it need a ConfirmDialog?
- Why does the super admin portal use a different route group
  from the school portal?
- Why do plan cards make more sense than a table for subscription plans?
- What does the audit log protect against?
