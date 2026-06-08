# Frontend Architecture — Aaramva Shikshya
# Session 11+ Planning Document

## Overview

The frontend is a Next.js 14 app (App Router) that serves:
1. **Super Admin Portal** — platform.aaramvashikshya.com — you manage all schools
2. **School Admin Portal** — {slug}.aaramvashikshya.com — school staff manage their school
3. **Parent/Student Portal** — {slug}.aaramvashikshya.com/portal — read-only views

Same Next.js app handles all three. The subdomain determines the tenant context.

---

## Tech stack (frontend)

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Next.js 14 (App Router) | SSR, file-based routing, server components |
| Language | TypeScript | Same as backend |
| Styling | Tailwind CSS | Fast, consistent, no CSS files |
| Components | shadcn/ui | Pre-built accessible components on top of Tailwind |
| State | Zustand | Simple global state (auth, tenant info) |
| Server state | TanStack Query (React Query) | API caching, loading states, mutations |
| Forms | React Hook Form + Zod | Validation matching backend DTOs |
| Tables | TanStack Table | Sortable/filterable data tables |
| Charts | Recharts | Dashboard analytics |
| Icons | Lucide React | Clean, consistent icons |
| HTTP client | Axios | Interceptors for auth headers |
| Date display | Custom hook using bs-calendar package | Always show BS dates |

---

## Folder structure (apps/web/)

```
apps/web/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx          ← school login
│   │   └── layout.tsx
│   ├── (super-admin)/
│   │   ├── layout.tsx            ← super admin shell
│   │   ├── dashboard/page.tsx
│   │   ├── schools/
│   │   │   ├── page.tsx          ← list schools
│   │   │   └── [id]/page.tsx     ← school detail
│   │   └── plans/page.tsx
│   ├── (school)/
│   │   ├── layout.tsx            ← school shell (sidebar, header)
│   │   ├── dashboard/page.tsx
│   │   ├── students/
│   │   │   ├── page.tsx          ← student list
│   │   │   ├── new/page.tsx      ← admission form
│   │   │   └── [id]/page.tsx     ← student profile
│   │   ├── attendance/
│   │   │   ├── page.tsx          ← mark attendance
│   │   │   └── reports/page.tsx
│   │   ├── finance/
│   │   │   ├── page.tsx          ← fee overview
│   │   │   ├── invoices/page.tsx
│   │   │   └── payments/page.tsx
│   │   ├── academic/
│   │   │   ├── classes/page.tsx
│   │   │   ├── subjects/page.tsx
│   │   │   └── timetable/page.tsx
│   │   ├── exams/
│   │   │   ├── page.tsx
│   │   │   ├── marks/page.tsx
│   │   │   └── results/page.tsx
│   │   ├── hr/
│   │   │   ├── staff/page.tsx
│   │   │   ├── leave/page.tsx
│   │   │   └── payroll/page.tsx
│   │   ├── library/page.tsx
│   │   └── communication/
│   │       ├── notices/page.tsx
│   │       └── sms/page.tsx
│   ├── layout.tsx                ← root layout
│   └── globals.css
├── components/
│   ├── ui/                       ← shadcn/ui components (auto-generated)
│   ├── layout/
│   │   ├── sidebar.tsx
│   │   ├── header.tsx
│   │   └── breadcrumb.tsx
│   ├── shared/
│   │   ├── data-table.tsx        ← reusable TanStack Table wrapper
│   │   ├── page-header.tsx
│   │   ├── bs-date.tsx           ← displays a date in BS format
│   │   ├── status-badge.tsx      ← colored badge for statuses
│   │   ├── confirm-dialog.tsx    ← "Are you sure?" modal
│   │   └── empty-state.tsx
│   ├── students/
│   │   ├── student-form.tsx
│   │   ├── student-table.tsx
│   │   └── student-card.tsx
│   ├── attendance/
│   │   └── attendance-grid.tsx   ← the 30-student bulk marking grid
│   ├── finance/
│   │   ├── invoice-card.tsx
│   │   └── payment-form.tsx
│   └── ... (one folder per module)
├── lib/
│   ├── api.ts                    ← Axios instance with interceptors
│   ├── auth.ts                   ← token storage, auth helpers
│   ├── hooks/
│   │   ├── use-bs-date.ts        ← convert and format BS dates
│   │   ├── use-tenant.ts         ← get current tenant from subdomain
│   │   └── use-auth.ts           ← current user, logout
│   └── utils.ts
├── store/
│   ├── auth.store.ts             ← Zustand: user, token, tenant
│   └── ui.store.ts               ← Zustand: sidebar open/close etc.
├── types/
│   └── api.types.ts              ← mirrors backend DTOs
└── next.config.js
```

---

## Subdomain routing in Next.js

Next.js middleware handles subdomain detection:

```typescript
// apps/web/middleware.ts
export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') ?? '';
  const subdomain = hostname.split('.')[0];

  // platform.aaramvashikshya.com → super admin
  if (subdomain === 'platform') {
    return NextResponse.rewrite(new URL('/super-admin' + request.nextUrl.pathname, request.url));
  }

  // sxs.aaramvashikshya.com → school portal
  // Store subdomain in header so server components can read it
  const response = NextResponse.next();
  response.headers.set('x-tenant-slug', subdomain);
  return response;
}
```

For local dev: use `localhost:3000` with the `X-Tenant-Slug` header
set by a toggle in the dev toolbar.

---

## API client setup

```typescript
// lib/api.ts
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1',
  withCredentials: true,   // sends httpOnly refresh cookie automatically
});

// Request interceptor — attach access token + tenant slug
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  const tenantSlug = useTenantStore.getState().slug;

  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (tenantSlug) config.headers['X-Tenant-Slug'] = tenantSlug;
  return config;
});

// Response interceptor — auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      // Try to refresh token
      try {
        const { data } = await axios.post('/api/v1/auth/refresh', {}, { withCredentials: true });
        useAuthStore.getState().setAccessToken(data.data.accessToken);
        // Retry original request
        error.config.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return axios(error.config);
      } catch {
        // Refresh failed — redirect to login
        useAuthStore.getState().logout();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
```

---

## Authentication flow (frontend)

1. User visits `sxs.aaramvashikshya.com`
2. Next.js middleware reads subdomain → sets `x-tenant-slug: sxs` header
3. No token in storage → redirect to `/login`
4. User submits login form → `POST /auth/login`
5. Backend sets httpOnly refresh cookie, returns access token
6. Access token stored in Zustand (memory only — not localStorage)
7. Every API call attaches `Authorization: Bearer {token}`
8. On page refresh: access token is lost (memory) but refresh cookie persists
9. On first load, call `GET /auth/me` — if refresh cookie valid, get new access token

---

## BS Date display component

```typescript
// components/shared/bs-date.tsx
// Used EVERYWHERE dates are displayed
import { adToBs, formatBs } from 'bs-calendar';

interface BsDateProps {
  date: string | { ad: string; bs: string };
  showAd?: boolean;
  lang?: 'en' | 'np';
}

export function BsDate({ date, showAd = false, lang = 'en' }: BsDateProps) {
  if (typeof date === 'object') {
    return (
      <span title={showAd ? `AD: ${date.ad}` : undefined}>
        {date.bs}
      </span>
    );
  }
  // Convert AD string to BS for display
  const bs = adToBs(new Date(date));
  const formatted = formatBs(bs, lang);
  return <span title={showAd ? `AD: ${date}` : undefined}>{formatted}</span>;
}
```

---

## Build session order for frontend

### Session 11 — Foundation + Auth + Layout
- Next.js 14 project setup with Tailwind + shadcn/ui
- Subdomain middleware
- API client (Axios + interceptors)
- Zustand auth store
- Login page (school login)
- Authenticated shell layout (sidebar + header)
- Dashboard placeholder pages

### Session 12 — Student Module UI
- Student list page with search + pagination
- Student admission form (multi-step)
- Student profile page
- Enrollment UI

### Session 13 — Attendance UI
- Attendance marking grid (bulk — all students in a section)
- Attendance reports (section report, student summary)

### Session 14 — Finance UI
- Fee structure setup
- Invoice generation
- Payment recording
- Reports (collection, defaulters, ledger)

### Session 15 — Academic + Exam UI
- Class/section/subject management
- Timetable builder
- Exam schedule + marks entry
- Report card view

### Session 16 — HR, Library, Communication UI
- Staff management
- Leave requests
- Payroll slips
- Library issue/return
- Notice board

### Session 17 — Super Admin Portal
- Platform dashboard
- School management
- Subscription management

### Session 18 — Mobile App (React Native)
- Expo setup
- Parent app: attendance view, fee status, notices
- Teacher app: mark attendance, view timetable

---

## CLAUDE.md addendum for frontend sessions

Add this section to CLAUDE.md before starting Session 11:

```markdown
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
```
