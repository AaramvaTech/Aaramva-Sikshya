# Frontend Session 11 — Foundation, Auth & Layout
# Aaramva Shikshya

## Prerequisites
- Backend complete (Sessions 0–10), 164 tests passing, API running on port 3001
- Node.js 18+ installed
- docs/frontend-architecture.md read in full

## Goal
Set up the entire Next.js frontend foundation:
- Project scaffold with Tailwind + shadcn/ui
- Subdomain-aware middleware
- Axios API client with auth interceptors
- Zustand auth store
- Login page (working, connects to real backend)
- Authenticated shell layout (sidebar + header + breadcrumbs)
- All dashboard placeholder pages (so routing is complete)
- 6 shared components used everywhere

After this session, you can log in as a school, see the dashboard,
and navigate to any module page (even if they show "Coming soon").

---

## Step 1 — Scaffold

```bash
cd apps/
npx create-next-app@latest web --typescript --tailwind --app --no-src-dir --import-alias "@/*"
cd web
npm install axios zustand @tanstack/react-query @tanstack/react-table
npm install react-hook-form @hookform/resolvers zod
npm install lucide-react recharts
npm install bs-calendar   # or use the path alias to packages/bs-calendar

# Install shadcn/ui
npx shadcn@latest init
# Choose: Default style, Slate base color, CSS variables yes

# Install shadcn components we'll use everywhere
npx shadcn@latest add button input label card table dialog dropdown-menu
npx shadcn@latest add avatar badge separator sheet skeleton toast
npx shadcn@latest add form select textarea alert
```

---

## Step 2 — Environment variables

Create `apps/web/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_APP_DOMAIN=localhost
NEXT_PUBLIC_SUPER_ADMIN_SUBDOMAIN=platform
```

---

## Step 3 — Next.js middleware (subdomain routing)

File: `apps/web/middleware.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') ?? '';
  const subdomain = hostname.split('.')[0].split(':')[0]; // strip port for localhost

  // Pass tenant slug to all routes via header
  const response = NextResponse.next();
  response.headers.set('x-tenant-slug', subdomain);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

---

## Step 4 — Zustand stores

### Auth store (`store/auth.store.ts`)
```typescript
interface AuthState {
  accessToken: string | null;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    tenantId: string | null;
    tenantSlug: string | null;
  } | null;
  setAuth: (token: string, user: AuthState['user']) => void;
  setAccessToken: (token: string) => void;
  logout: () => void;
}
```

### Tenant store (`store/tenant.store.ts`)
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

## Step 5 — API client

File: `lib/api.ts`

Build the Axios instance with:
1. baseURL from NEXT_PUBLIC_API_URL
2. withCredentials: true
3. Request interceptor: attach Bearer token + X-Tenant-Slug header
4. Response interceptor: on 401, try POST /auth/refresh, retry original request
   If refresh fails → call authStore.logout() + redirect to /login

Also create typed API functions:
```typescript
// lib/api/auth.api.ts
export const authApi = {
  login: (data: LoginDto) => api.post<ApiResponse<LoginResponse>>('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get<ApiResponse<UserResponse>>('/auth/me'),
  refresh: () => api.post<ApiResponse<{ accessToken: string }>>('/auth/refresh'),
};
```

---

## Step 6 — Root layout + providers

File: `app/layout.tsx`
Wrap with:
- `QueryClientProvider` (TanStack Query)
- `Toaster` (shadcn toast notifications)

File: `app/providers.tsx` — client component that holds all providers

---

## Step 7 — Login page

File: `app/(auth)/login/page.tsx`

Design:
- Centered card, 400px wide
- Aaramva Shikshya logo/name at top
- Email + Password fields (React Hook Form + Zod)
- "Sign In" button with loading state
- Error message if credentials wrong
- On success: store token + user → redirect to /dashboard

Zod schema:
```typescript
const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});
```

On submit:
```typescript
const { data } = await authApi.login({ email, password });
setAuth(data.data.accessToken, data.data.user);
router.push('/dashboard');
```

---

## Step 8 — Auth guard (middleware-level)

Add to `middleware.ts`: if no token cookie AND path is not /login → redirect to /login.

Actually for Next.js App Router, use a `(school)/layout.tsx` server component:
```typescript
// app/(school)/layout.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default function SchoolLayout({ children }) {
  // Check for refresh_token cookie — if missing, redirect to login
  const cookieStore = cookies();
  const hasSession = cookieStore.has('refresh_token');
  if (!hasSession) redirect('/login');
  return <SchoolShell>{children}</SchoolShell>;
}
```

---

## Step 9 — School shell layout

File: `components/layout/school-shell.tsx` — client component

Structure:
```
┌─────────────────────────────────────────────────────┐
│  HEADER: Logo | School Name | User Menu             │
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│ SIDEBAR  │  PAGE CONTENT                            │
│          │                                          │
│ Nav items│  <PageHeader title="Students" />         │
│ by role  │  {children}                              │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```

Sidebar nav items (show/hide based on user role):
```typescript
const navItems = [
  { href: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard',   roles: ['all'] },
  { href: '/students',     icon: Users,           label: 'Students',    roles: ['PRINCIPAL','ACADEMIC_COORDINATOR','TEACHER'] },
  { href: '/attendance',   icon: CheckSquare,     label: 'Attendance',  roles: ['TEACHER','PRINCIPAL','ACADEMIC_COORDINATOR'] },
  { href: '/academic',     icon: BookOpen,        label: 'Academic',    roles: ['PRINCIPAL','ACADEMIC_COORDINATOR'] },
  { href: '/finance',      icon: CreditCard,      label: 'Finance',     roles: ['ACCOUNTANT','PRINCIPAL','SCHOOL_OWNER'] },
  { href: '/exams',        icon: FileText,        label: 'Examinations',roles: ['PRINCIPAL','ACADEMIC_COORDINATOR','TEACHER'] },
  { href: '/hr',           icon: UserCog,         label: 'HR & Staff',  roles: ['PRINCIPAL','SCHOOL_OWNER'] },
  { href: '/library',      icon: Library,         label: 'Library',     roles: ['LIBRARIAN','PRINCIPAL'] },
  { href: '/communication',icon: MessageSquare,   label: 'Communication',roles: ['PRINCIPAL','TEACHER'] },
];
```

---

## Step 10 — Dashboard page

File: `app/(school)/dashboard/page.tsx`

Four stat cards at top (TanStack Query fetching from backend):
- Total Students
- Today's Attendance %
- Pending Fees (Rs.)
- Notices (unread)

Below: Recent activity placeholder (static for now).

---

## Step 11 — Placeholder pages

Create these files, each showing:
```tsx
<PageHeader title="[Module Name]" />
<EmptyState message="This section is coming soon" />
```

- `app/(school)/students/page.tsx`
- `app/(school)/attendance/page.tsx`
- `app/(school)/academic/page.tsx`
- `app/(school)/finance/page.tsx`
- `app/(school)/exams/page.tsx`
- `app/(school)/hr/page.tsx`
- `app/(school)/library/page.tsx`
- `app/(school)/communication/page.tsx`

---

## Step 12 — Shared components (build all 6)

### 1. `<BsDate>` — `components/shared/bs-date.tsx`
Displays a date in BS format. If prop is `{ ad, bs }` object (from API), show `bs` with AD as tooltip.
If prop is a plain string (AD date), convert using adToBs from bs-calendar.

### 2. `<StatusBadge>` — `components/shared/status-badge.tsx`
Colored badge for status values:
```typescript
const statusColors = {
  PRESENT: 'bg-green-100 text-green-800',
  ABSENT: 'bg-red-100 text-red-800',
  LATE: 'bg-yellow-100 text-yellow-800',
  PAID: 'bg-green-100 text-green-800',
  UNPAID: 'bg-red-100 text-red-800',
  PARTIAL: 'bg-yellow-100 text-yellow-800',
  OVERDUE: 'bg-red-100 text-red-800',
  ACTIVE: 'bg-green-100 text-green-800',
  INACTIVE: 'bg-gray-100 text-gray-600',
  PENDING: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
};
```

### 3. `<DataTable>` — `components/shared/data-table.tsx`
TanStack Table wrapper with:
- Column definitions as props
- Built-in pagination (page, limit controls)
- Search input (optional)
- Loading skeleton
- Empty state

### 4. `<ConfirmDialog>` — `components/shared/confirm-dialog.tsx`
shadcn Dialog wrapper:
```typescript
interface ConfirmDialogProps {
  title: string;
  description: string;
  onConfirm: () => void | Promise<void>;
  trigger: React.ReactNode;
  confirmLabel?: string;    // default "Confirm"
  variant?: 'default' | 'destructive';
}
```

### 5. `<PageHeader>` — `components/shared/page-header.tsx`
```typescript
interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;   // e.g. <Button>Add Student</Button>
}
```

### 6. `<EmptyState>` — `components/shared/empty-state.tsx`
Centered illustration (use a Lucide icon) + message + optional action button.

---

## Types file

`types/api.types.ts` — add these to start:
```typescript
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: { page: number; limit: number; total: number };
}

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string; email: string; firstName: string; lastName: string;
    role: string; tenantId: string; tenantSlug: string;
  };
}

export interface UserResponse {
  id: string; email: string; firstName: string; lastName: string;
  role: string; tenantSlug: string;
}
```

---

## Exact prompt for Claude Code

```
Read CLAUDE.md in full. Confirm you have read it.
Then read docs/frontend-architecture.md in full.
Then read docs/api-contracts/11-frontend-session1.md in full.

The NestJS backend is complete (Sessions 0–10), running on port 3001.
Session 11 starts the Next.js frontend (apps/web/).

Work in this exact order:

1. Scaffold Next.js 14 in apps/web/ with TypeScript, Tailwind, App Router.
   Install all dependencies from the spec.
   Run: npx shadcn@latest init (choose Default style, Slate, CSS variables)
   Install shadcn components: button input label card table dialog
   dropdown-menu avatar badge separator sheet skeleton toast form select textarea alert

2. Create .env.local with API URL.

3. Build subdomain middleware (apps/web/middleware.ts).

4. Create Zustand stores: store/auth.store.ts, store/tenant.store.ts.

5. Build lib/api.ts — Axios instance with request + response interceptors.
   Create lib/api/auth.api.ts with login, logout, me, refresh functions.

6. Build app/providers.tsx and update app/layout.tsx.

7. Build the login page (app/(auth)/login/page.tsx):
   - React Hook Form + Zod validation
   - Calls authApi.login()
   - Stores token in Zustand
   - Redirects to /dashboard on success
   - Shows error toast on failure

8. Build the school shell layout:
   - components/layout/sidebar.tsx — nav items filtered by role
   - components/layout/header.tsx — school name, user avatar, logout
   - app/(school)/layout.tsx — auth guard + shell wrapper

9. Build the dashboard page with 4 stat cards.

10. Create placeholder pages for all 8 modules.

11. Build all 6 shared components:
    BsDate, StatusBadge, DataTable, ConfirmDialog, PageHeader, EmptyState

12. Create types/api.types.ts with base response types.

After each step confirm it compiles (npm run build or npm run dev).
The login page must work against the real backend (port 3001).

Frontend rules (always):
- Never localStorage for tokens
- Always <BsDate> for date display
- Always TanStack Query for API calls (no useEffect + fetch)
- Tailwind only — no inline styles
- shadcn/ui for all UI primitives
```
