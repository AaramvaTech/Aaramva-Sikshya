# Frontend Session 11 — Foundation, Auth & Layout
# Design Spec — Aaramva Shikshya

**Date:** 2026-06-05  
**Scope:** Next.js 14 frontend foundation (apps/web/) — scaffold, auth, shell, dashboard, shared components  
**Prerequisites:** NestJS backend complete (Sessions 0–10), 164 tests passing, API on port 3001  

---

## 1. Visual System & Theme

**Brand color:** `#1A5C38` (Aaramva Forest Green — extracted from logo)  
**Approach:** Light with green accents (not dark sidebar)

| Token | Value | Usage |
|---|---|---|
| Primary | `#1A5C38` | Buttons, active nav, focus rings |
| Primary hover | `#155030` | Button hover state |
| Page canvas | `#F8FAF9` | App background (faint green tint) |
| Card bg | `#FFFFFF` | Cards, sidebar, header |
| Text primary | `#111827` | Headings, body |
| Text muted | `#6B7280` | Labels, secondary text |
| Border | `#E5E7EB` | Dividers, input borders |

**shadcn CSS variable override** in `globals.css`:
```css
--primary: 156 64% 24%;        /* #1A5C38 */
--primary-foreground: 0 0% 100%;
```

**Logo:** Use `shikshya.jpeg` (full wordmark) at ~140px wide in sidebar top. Text fallback if image fails.  
**Typography:** Tailwind system font stack — no custom font imports.  
**No inline styles** — Tailwind utility classes only.

---

## 2. Architecture & Routing

### Route groups

```
apps/web/app/
├── layout.tsx                     ← root: QueryClientProvider + Toaster
├── (auth)/
│   ├── layout.tsx                 ← no shell, centered page
│   └── login/page.tsx
└── (school)/
    ├── layout.tsx                 ← Server Component: auth guard → SchoolShell
    ├── dashboard/page.tsx
    ├── students/page.tsx
    ├── attendance/page.tsx
    ├── academic/page.tsx
    ├── finance/page.tsx
    ├── exams/page.tsx
    ├── hr/page.tsx
    ├── library/page.tsx
    └── communication/page.tsx
```

### Subdomain middleware (`middleware.ts`)

Reads `host` header, strips port, extracts subdomain, forwards as `x-tenant-slug` response header.  
Matcher excludes `_next/static`, `_next/image`, `favicon.ico`.  
Local dev: subdomain = `localhost` (ignored) — slug comes from Zustand store set at login.

### Auth guard

`(school)/layout.tsx` is a **Server Component**. Checks for `refresh_token` cookie via `cookies()`.  
- Absent → `redirect('/login')`  
- Present → renders `<SchoolShell>{children}</SchoolShell>` (client component)

### Token strategy

- Access token: Zustand memory only (never localStorage, never sessionStorage)
- Refresh token: httpOnly cookie set by backend — survives page refresh
- On app mount: `providers.tsx` calls `GET /auth/me` — backend re-issues access token if cookie valid
- Axios interceptor: on `401` → `POST /auth/refresh` → retry original request once → if fails: `logout()` + redirect `/login`

---

## 3. Zustand Stores

### `store/auth.store.ts`
```typescript
interface AuthState {
  accessToken: string | null;
  user: {
    id: string; email: string; firstName: string; lastName: string;
    role: string; tenantId: string | null; tenantSlug: string | null;
  } | null;
  setAuth: (token: string, user: AuthState['user']) => void;
  setAccessToken: (token: string) => void;
  logout: () => void;
}
```

### `store/tenant.store.ts`
```typescript
interface TenantState {
  slug: string | null;
  name: string | null;
  logoUrl: string | null;
  primaryColor: string;
  setTenant: (tenant: Partial<TenantState>) => void;
}
```

---

## 4. API Client

### `lib/api.ts`
- Axios instance: `baseURL = NEXT_PUBLIC_API_URL`, `withCredentials: true`
- Request interceptor: attaches `Authorization: Bearer {token}` + `X-Tenant-Slug: {slug}`
- Response interceptor: `401` → refresh → retry once → logout + redirect

### `lib/api/auth.api.ts`
```typescript
export const authApi = {
  login:   (data: LoginDto) => api.post<ApiResponse<LoginResponse>>('/auth/login', data),
  logout:  ()               => api.post('/auth/logout'),
  me:      ()               => api.get<ApiResponse<UserResponse>>('/auth/me'),
  refresh: ()               => api.post<ApiResponse<{ accessToken: string }>>('/auth/refresh'),
};
```

---

## 5. Co-Branding & School Identity

**Layout:** School's logo in sidebar header (prominent). "Powered by Aaramva Shikshya" with the small mark in sidebar footer.

**School logo source:** `logoUrl` from `tenant.store.ts` — populated after login. Falls back to a shadcn `<Avatar>` showing the school's initials (e.g., "SXS") if no logo is uploaded yet.

**School name source:** `tenantName` field in login response (see backend change below).

**"Powered by" footer:**
```
[tiny Aaramva mark] Powered by Aaramva Shikshya
```
Rendered at the bottom of the sidebar in `text-xs text-gray-400`.

### Backend change required (bundled into Session 11)

The current `auth.service.ts` login response returns only `{ accessToken, user: { id, email, role } }`. The tenant name and logo are not included.

**Change:** Enhance `AuthService.login()` and `AuthService.getMe()` to also query `public.tenants` for `name` and `logo_url`, returning them in the response. This allows the frontend to populate `tenant.store` on login and on `GET /auth/me` (page refresh recovery).

Updated `LoginResponse` shape:
```typescript
{
  accessToken: string;
  user: { id, email, firstName, lastName, role, tenantId, tenantSlug };
  tenant: { name: string; slug: string; logoUrl: string | null };
}
```

The `tenant` object populates `tenant.store.ts` on login and on `GET /auth/me`.

---

## 6. Shell Layout

```
┌──────────────────────────────────────────────────────────────┐
│ HEADER  [Logo 140px]     [School Name]          [Avatar ▾]   │
│         white bg, 1px border-bottom (#E5E7EB)                │
├────────────┬─────────────────────────────────────────────────┤
│ SIDEBAR    │  PAGE CONTENT                                    │
│ 240px      │  p-6, bg-[#F8FAF9]                              │
│ white bg   │                                                  │
│ sticky     │  <PageHeader title="..." action={...} />        │
│            │  {children}                                      │
│ Nav items  │                                                  │
└────────────┴─────────────────────────────────────────────────┘
```

### Sidebar nav item states
- Default: `text-gray-600`, icon `text-gray-400`, `hover:bg-gray-50 rounded-lg`
- Active: `bg-[#1A5C38] text-white rounded-lg`, icon white

### Nav groups
```
[Dashboard]

── SCHOOL ──
[Students]     roles: PRINCIPAL, ACADEMIC_COORDINATOR, TEACHER
[Attendance]   roles: TEACHER, PRINCIPAL, ACADEMIC_COORDINATOR
[Academic]     roles: PRINCIPAL, ACADEMIC_COORDINATOR
[Examinations] roles: PRINCIPAL, ACADEMIC_COORDINATOR, TEACHER

── ADMINISTRATION ──
[Finance]      roles: ACCOUNTANT, PRINCIPAL, SCHOOL_OWNER
[HR & Staff]   roles: PRINCIPAL, SCHOOL_OWNER
[Library]      roles: LIBRARIAN, PRINCIPAL
[Communication]roles: PRINCIPAL, TEACHER
```

Dashboard shown to all roles.

### Header right
School name (`font-medium`) + shadcn `<Avatar>` with dropdown → Profile, Logout.

### Mobile
Sidebar collapses to shadcn `<Sheet>` (off-canvas). Hamburger icon in header. Breakpoint: `lg` (1024px).

---

## 7. Login Page

```
[Page canvas: #F8FAF9]
┌──────────────────────────────┐
│  [Aaramva Shikshya logo]     │
│  "Sign in to your school"    │
│  ─────────────────────────   │
│  Email  [________________]   │
│  Password [______________]   │
│                              │
│  [       Sign In       ]     │  ← bg-[#1A5C38] white text
│                              │
│  {inline error message}      │
└──────────────────────────────┘
   max-w-[400px], rounded-xl, shadow-sm, white
```

- React Hook Form + Zod (`email().min(1)`, `password.min(1)`)
- On success: `setAuth(token, user)` → `router.push('/dashboard')`
- On failure: shadcn `toast` with error message
- Loading: spinner inside Sign In button, button disabled during request

---

## 8. Dashboard Page

Four stat cards (TanStack Query, independent queries):

| Card | Icon | Query endpoint |
|---|---|---|
| Total Students | `Users` | `GET /students?page=1&limit=1` → use `meta.total` |
| Today's Attendance % | `CheckSquare` | `GET /attendance/students/school/summary` → `data.percent` |
| Pending Fees (Rs.) | `CreditCard` | `GET /finance/reports/collection` → `data.totalPending` (gracefully handles missing academicYearId with 0) |
| Unread Notices | `Bell` | `GET /communication/notifications/unread-count` → `data.count` |

Card design: white bg, `rounded-xl`, `shadow-sm`, green Lucide icon top-left, value in `text-3xl font-bold text-[#1A5C38]`, label `text-sm text-gray-500`.

Each card loads independently with a `<Skeleton>` while fetching.

---

## 9. Placeholder Module Pages

All 8 module routes render:
```tsx
<PageHeader title="[Module Name]" />
<EmptyState message="This section is coming soon" />
```

Routes: `/students`, `/attendance`, `/academic`, `/finance`, `/exams`, `/hr`, `/library`, `/communication`

---

## 10. Shared Components

### `<BsDate>` (`components/shared/bs-date.tsx`)
- Props: `date: string | { ad: string; bs: string }`, `showAd?: boolean`, `lang?: 'en' | 'np'`
- Object form: render `bs` string, AD in `title` tooltip
- String form: call `adToBs()` from `bs-calendar`, then `formatBs()`

### `<StatusBadge>` (`components/shared/status-badge.tsx`)
- 12-status color map (PRESENT/PAID/ACTIVE/APPROVED = green; ABSENT/UNPAID/OVERDUE/REJECTED = red; LATE/PARTIAL/PENDING = yellow; INACTIVE = gray)
- `rounded-full px-2.5 py-0.5 text-xs font-medium`

### `<DataTable>` (`components/shared/data-table.tsx`)
- TanStack Table wrapper
- Props: `columns`, `data`, `isLoading`, `pagination?`, `onSearchChange?`
- Built-in: search input (optional), page size selector, prev/next buttons, row count
- Loading state: renders `<Skeleton>` rows
- Empty state: renders `<EmptyState>`

### `<ConfirmDialog>` (`components/shared/confirm-dialog.tsx`)
- Props: `title`, `description`, `onConfirm`, `trigger`, `confirmLabel?`, `variant?: 'default' | 'destructive'`
- `destructive` variant: confirm button is red (`bg-red-600`)

### `<PageHeader>` (`components/shared/page-header.tsx`)
- Props: `title: string`, `description?: string`, `action?: React.ReactNode`
- Layout: title left, action right, `mb-6`

### `<EmptyState>` (`components/shared/empty-state.tsx`)
- Props: `message: string`, `icon?: LucideIcon`, `action?: React.ReactNode`
- Default icon: `Inbox` from Lucide
- Centered, `py-16`, icon `text-gray-300`

---

## 11. Types (`types/api.types.ts`)

```typescript
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: { page: number; limit: number; total: number };
}

export interface TenantInfo {
  name: string; slug: string; logoUrl: string | null;
}

export interface LoginResponse {
  accessToken: string;
  user: UserResponse & { tenantId: string; tenantSlug: string };
  tenant: TenantInfo;
}

export interface UserResponse {
  id: string; email: string; firstName: string; lastName: string;
  role: string; tenantSlug: string;
}

export type LoginDto = { email: string; password: string };
```

---

## 11. Environment Variables (`apps/web/.env.local`)

```
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_APP_DOMAIN=localhost
NEXT_PUBLIC_SUPER_ADMIN_SUBDOMAIN=platform
```

---

## 12. Dependencies

```bash
# Core
npx create-next-app@latest web --typescript --tailwind --app --no-src-dir --import-alias "@/*"
npm install axios zustand @tanstack/react-query @tanstack/react-table
npm install react-hook-form @hookform/resolvers zod
npm install lucide-react recharts

# bs-calendar from workspace
npm install bs-calendar

# shadcn init + components
npx shadcn@latest init   # Default style, Slate, CSS variables
npx shadcn@latest add button input label card table dialog dropdown-menu
npx shadcn@latest add avatar badge separator sheet skeleton toast
npx shadcn@latest add form select textarea alert
```

---

## Frontend Rules (enforced throughout)

- Never `localStorage` for tokens — access token in Zustand memory only
- Always `<BsDate>` for date display — never raw date strings
- Always TanStack Query for API calls — never `useEffect + fetch`
- Forms use React Hook Form — never uncontrolled inputs
- All API response types in `types/api.types.ts`
- Tailwind only — no inline styles, no CSS modules
- shadcn/ui for all UI primitives
