# Session 11 Frontend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the entire Next.js 14 frontend foundation — auth flow, green-themed shell layout, dashboard, and all shared components — so any school can log in, see their dashboard, and navigate to all module pages.

**Architecture:** Next.js 14 App Router with route groups `(auth)` (public) and `(school)` (auth-guarded). Access token lives in Zustand memory only; refresh token in httpOnly cookie set by the API (port 3001). Because the refresh cookie's domain/port differs from the Next.js server, auth guarding is done client-side: the `SchoolShell` component waits for session restoration, then redirects to `/login` if no token. The Axios client intercepts 401s and auto-refreshes. On page refresh, the subdomain is read from `window.location.hostname` to restore the tenant slug before calling `/auth/refresh`.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, Zustand, TanStack Query, TanStack Table, React Hook Form + Zod, Axios, Lucide React, bs-calendar (via webpack alias to local package)

---

## File Structure Map

**Backend changes (apps/api/):**
- Modify: `apps/api/src/modules/auth/auth.service.ts` — add tenant query to `login()` and `getMe()`
- Modify: `apps/api/src/modules/auth/auth.controller.ts` — include `tenant` in login response
- Modify: `apps/api/src/modules/auth/__tests__/auth.service.spec.ts` — update mocks for new queries

**Frontend — new files (apps/web/):**
- Create: `.env.local`
- Create: `middleware.ts`
- Create: `next.config.ts` (from scaffold, then modify)
- Create: `tsconfig.json` (from scaffold, then modify)
- Create: `app/globals.css` (from scaffold, then modify)
- Create: `app/layout.tsx` (from scaffold, then modify)
- Create: `app/providers.tsx`
- Create: `app/(auth)/layout.tsx`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(school)/layout.tsx`
- Create: `app/(school)/dashboard/page.tsx`
- Create: `app/(school)/students/page.tsx`
- Create: `app/(school)/attendance/page.tsx`
- Create: `app/(school)/academic/page.tsx`
- Create: `app/(school)/finance/page.tsx`
- Create: `app/(school)/exams/page.tsx`
- Create: `app/(school)/hr/page.tsx`
- Create: `app/(school)/library/page.tsx`
- Create: `app/(school)/communication/page.tsx`
- Create: `store/auth.store.ts`
- Create: `store/tenant.store.ts`
- Create: `lib/api.ts`
- Create: `lib/api/auth.api.ts`
- Create: `types/api.types.ts`
- Create: `components/layout/sidebar.tsx`
- Create: `components/layout/header.tsx`
- Create: `components/layout/school-shell.tsx`
- Create: `components/shared/bs-date.tsx`
- Create: `components/shared/status-badge.tsx`
- Create: `components/shared/data-table.tsx`
- Create: `components/shared/confirm-dialog.tsx`
- Create: `components/shared/page-header.tsx`
- Create: `components/shared/empty-state.tsx`
- Create: `public/logo.jpeg` (copy from images directory)

---

## Task 1: Backend — Add tenant info to auth responses

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/src/modules/auth/auth.controller.ts`
- Modify: `apps/api/src/modules/auth/__tests__/auth.service.spec.ts`

- [ ] **Step 1: Update `auth.service.ts` — add tenant query to `login()`**

In `apps/api/src/modules/auth/auth.service.ts`, replace the `login()` method (lines 76–104) with:

```typescript
async login(dto: LoginDto) {
  const ctx = this.tenantContext.getOrThrow();

  const rows = await this.tenantPrisma.query<DbUser & { password_hash: string; is_active: boolean }>(
    `SELECT id, email, role, password_hash, is_active
     FROM users WHERE email = $1 AND deleted_at IS NULL`,
    dto.email,
  );
  const user = rows[0];

  if (!user || !user.is_active) {
    throw new UnauthorizedException('Invalid credentials');
  }
  const ok = await bcrypt.compare(dto.password, user.password_hash);
  if (!ok) {
    throw new UnauthorizedException('Invalid credentials');
  }

  await this.tenantPrisma.execute(
    `UPDATE users SET last_login_at = NOW() WHERE id = $1::uuid`,
    user.id,
  );

  const tenantRows = await this.tenantPrisma.query<{ name: string; logo_url: string | null }>(
    `SELECT name, logo_url FROM public.tenants WHERE id = $1::uuid`,
    ctx.tenantId,
  );

  const tokens = await this.issueTokens(user, ctx);
  return {
    ...tokens,
    tenant: {
      name: tenantRows[0]?.name ?? ctx.slug,
      slug: ctx.slug,
      logoUrl: tenantRows[0]?.logo_url ?? null,
    },
    user: { id: user.id, email: user.email, role: user.role },
  };
}
```

- [ ] **Step 2: Update `auth.service.ts` — add tenant query to `getMe()`**

Replace the `getMe()` method (lines 156–167) with:

```typescript
async getMe(user: AuthUser) {
  const rows = await this.tenantPrisma.query<{
    id: string; email: string; first_name: string; last_name: string;
    role: string; phone: string | null; avatar_url: string | null;
  }>(
    `SELECT id, email, first_name, last_name, role, phone, avatar_url
     FROM users WHERE id = $1::uuid AND deleted_at IS NULL`,
    user.userId,
  );
  if (!rows[0]) {
    throw new UnauthorizedException('User no longer exists');
  }

  let tenant: { name: string; slug: string; logoUrl: string | null } | null = null;
  if (user.tenantId) {
    const tenantRows = await this.tenantPrisma.query<{ name: string; logo_url: string | null }>(
      `SELECT name, logo_url FROM public.tenants WHERE id = $1::uuid`,
      user.tenantId,
    );
    if (tenantRows[0]) {
      tenant = {
        name: tenantRows[0].name,
        slug: user.tenantSlug ?? '',
        logoUrl: tenantRows[0].logo_url,
      };
    }
  }

  const r = rows[0];
  return {
    id: r.id,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
    role: r.role,
    phone: r.phone,
    avatarUrl: r.avatar_url,
    tenantId: user.tenantId,
    tenantSlug: user.tenantSlug,
    tenant,
  };
}
```

- [ ] **Step 3: Update `auth.controller.ts` — include tenant in login response**

In `apps/api/src/modules/auth/auth.controller.ts`, replace the `login()` controller method return (line 52):

```typescript
// Before:
return { accessToken: result.accessToken, user: result.user };

// After:
return { accessToken: result.accessToken, user: result.user, tenant: result.tenant };
```

- [ ] **Step 4: Update the login test — mock the second `tenantPrisma.query` call**

In `apps/api/src/modules/auth/__tests__/auth.service.spec.ts`, replace the `login()` `describe` block with:

```typescript
describe('login()', () => {
  const mockTenant = { name: 'Test School', logo_url: null };

  it('returns tokens with tenant info for valid credentials', async () => {
    const hash = await bcrypt.hash('Secret123', 1);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ ...mockUser, password_hash: hash }])
      .mockResolvedValueOnce([mockTenant]);
    (tenantPrisma.execute as jest.Mock).mockResolvedValue(1);

    const result = await authService.login({
      email: 'ram@test.edu.np',
      password: 'Secret123',
    });

    expect(result.accessToken).toBe('mock.jwt.token');
    expect(result.user.role).toBe('SCHOOL_OWNER');
    expect(result.tenant.name).toBe('Test School');
    expect(result.tenant.slug).toBe('testschool');
    expect(result.tenant.logoUrl).toBeNull();
  });

  it('throws UnauthorizedException for wrong password', async () => {
    const hash = await bcrypt.hash('Secret123', 1);
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
      { ...mockUser, password_hash: hash },
    ]);

    await expect(
      authService.login({ email: 'ram@test.edu.np', password: 'wrongpassword' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException for unknown email', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

    await expect(
      authService.login({ email: 'nobody@test.np', password: 'Secret123' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 5: Add a `getMe()` test block**

Append this `describe` block inside the outer `describe('AuthService')`, after the `refresh()` block:

```typescript
describe('getMe()', () => {
  it('returns camelCase user with tenant info', async () => {
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{
        id: 'uid-1', email: 'ram@test.edu.np',
        first_name: 'Ram', last_name: 'Bahadur',
        role: 'SCHOOL_OWNER', phone: null, avatar_url: null,
      }])
      .mockResolvedValueOnce([{ name: 'Test School', logo_url: null }]);

    const result = await authService.getMe({
      userId: 'uid-1',
      email: 'ram@test.edu.np',
      role: 'SCHOOL_OWNER' as any,
      tenantId: 'tid-1',
      tenantSlug: 'testschool',
    });

    expect(result.firstName).toBe('Ram');
    expect(result.tenant?.name).toBe('Test School');
    expect(result.tenant?.slug).toBe('testschool');
  });

  it('throws UnauthorizedException if user not found', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

    await expect(
      authService.getMe({
        userId: 'uid-gone',
        email: 'x@x.com',
        role: 'TEACHER' as any,
        tenantId: 'tid-1',
        tenantSlug: 'testschool',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 6: Run tests and verify they pass**

```powershell
cd apps/api
npm test -- --testPathPattern=auth.service
```

Expected: All tests pass (previously 8, now 10 with the 2 new getMe tests).

- [ ] **Step 7: Commit backend changes**

```powershell
git add apps/api/src/modules/auth/auth.service.ts
git add apps/api/src/modules/auth/auth.controller.ts
git add apps/api/src/modules/auth/__tests__/auth.service.spec.ts
git commit -m "feat(auth): include tenant name+logo in login and me responses"
```

---

## Task 2: Scaffold Next.js 14 in apps/web/

**Files:**
- Create: all files in `apps/web/` (managed by create-next-app + shadcn)

- [ ] **Step 1: Remove the empty apps/web dir and scaffold fresh**

```powershell
cd apps
Remove-Item -Recurse -Force web
npx create-next-app@latest web --typescript --tailwind --app --no-src-dir --import-alias "@/*" --yes
```

When prompted (if `--yes` doesn't skip all):
- Would you like to use ESLint? → Yes
- Would you like to use Turbopack? → No (keep stable webpack)

- [ ] **Step 2: Install runtime dependencies**

```powershell
cd web
npm install axios zustand @tanstack/react-query @tanstack/react-table
npm install react-hook-form @hookform/resolvers zod
npm install lucide-react recharts
```

- [ ] **Step 3: Initialise shadcn/ui**

```powershell
npx shadcn@latest init
```

When prompted:
- Which style? → **Default**
- Which color? → **Slate**
- Use CSS variables? → **Yes**

- [ ] **Step 4: Install all shadcn components we'll use**

```powershell
npx shadcn@latest add button input label card table dialog dropdown-menu avatar badge separator sheet skeleton toast form select textarea alert
```

Answer `y` to any "overwrite" prompts.

- [ ] **Step 5: Verify dev server starts**

```powershell
npm run dev
```

Expected: Server starts on http://localhost:3000 with no errors. Press Ctrl+C to stop.

- [ ] **Step 6: Commit scaffold**

```powershell
cd ..
git add apps/web
git commit -m "chore(web): scaffold Next.js 14 with shadcn/ui and all dependencies"
```

---

## Task 3: Theme, Config, and bs-calendar Path Alias

**Files:**
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/tsconfig.json`
- Create: `apps/web/.env.local`

- [ ] **Step 1: Create `.env.local`**

Create `apps/web/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_APP_DOMAIN=localhost
NEXT_PUBLIC_SUPER_ADMIN_SUBDOMAIN=platform
```

- [ ] **Step 2: Override CSS variables in `globals.css` for the forest green theme**

Replace the entire `:root` and `.dark` blocks in `apps/web/app/globals.css`. Keep only what shadcn generated but update the `--primary` variables:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 156 55% 23%;
    --primary-foreground: 0 0% 100%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 156 30% 95%;
    --accent-foreground: 156 55% 23%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 156 55% 23%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --primary: 156 55% 40%;
    --primary-foreground: 0 0% 100%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
  }
}

* {
  border-color: hsl(var(--border));
}

body {
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
}
```

- [ ] **Step 3: Add bs-calendar webpack alias and update `next.config.ts`**

Replace the contents of `apps/web/next.config.ts`:

```typescript
import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'bs-calendar': path.resolve(__dirname, '../../packages/bs-calendar/src/index.ts'),
    };
    return config;
  },
};

export default nextConfig;
```

- [ ] **Step 4: Add bs-calendar path to `tsconfig.json`**

In `apps/web/tsconfig.json`, inside `compilerOptions.paths`, add the bs-calendar alias:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"],
      "bs-calendar": ["../../packages/bs-calendar/src/index.ts"]
    }
  }
}
```

(Keep all other tsconfig fields as create-next-app generated them.)

- [ ] **Step 5: Verify it compiles**

```powershell
npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/.env.local apps/web/app/globals.css apps/web/next.config.ts apps/web/tsconfig.json
git commit -m "chore(web): forest green theme, bs-calendar alias, env vars"
```

---

## Task 4: Core API Types

**Files:**
- Create: `apps/web/types/api.types.ts`

- [ ] **Step 1: Create `types/api.types.ts`**

```typescript
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: { page: number; limit: number; total: number };
}

export interface TenantInfo {
  name: string;
  slug: string;
  logoUrl: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  tenantId: string | null;
  tenantSlug: string | null;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
  tenant: TenantInfo;
}

export interface MeResponse extends AuthUser {
  phone: string | null;
  avatarUrl: string | null;
  tenant: TenantInfo | null;
}

export type LoginDto = { email: string; password: string };
```

- [ ] **Step 2: Commit**

```powershell
git add apps/web/types/api.types.ts
git commit -m "chore(web): add core API types"
```

---

## Task 5: Zustand Stores

**Files:**
- Create: `apps/web/store/auth.store.ts`
- Create: `apps/web/store/tenant.store.ts`

- [ ] **Step 1: Create `store/auth.store.ts`**

```typescript
import { create } from 'zustand';
import type { AuthUser } from '@/types/api.types';

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  isInitialized: boolean;
  setAuth: (token: string, user: AuthUser) => void;
  setAccessToken: (token: string) => void;
  setInitialized: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isInitialized: false,
  setAuth: (token, user) => set({ accessToken: token, user, isInitialized: true }),
  setAccessToken: (token) => set({ accessToken: token, isInitialized: true }),
  setInitialized: () => set({ isInitialized: true }),
  logout: () => set({ accessToken: null, user: null, isInitialized: true }),
}));
```

- [ ] **Step 2: Create `store/tenant.store.ts`**

```typescript
import { create } from 'zustand';
import type { TenantInfo } from '@/types/api.types';

interface TenantState {
  slug: string | null;
  name: string | null;
  logoUrl: string | null;
  setTenant: (tenant: Partial<TenantInfo>) => void;
  clear: () => void;
}

export const useTenantStore = create<TenantState>((set) => ({
  slug: null,
  name: null,
  logoUrl: null,
  setTenant: (t) => set({ slug: t.slug, name: t.name, logoUrl: t.logoUrl }),
  clear: () => set({ slug: null, name: null, logoUrl: null }),
}));
```

- [ ] **Step 3: Commit**

```powershell
git add apps/web/store
git commit -m "feat(web): add Zustand auth + tenant stores"
```

---

## Task 6: Axios API Client

**Files:**
- Create: `apps/web/lib/api.ts`
- Create: `apps/web/lib/api/auth.api.ts`

- [ ] **Step 1: Create `lib/api.ts`**

```typescript
import axios from 'axios';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  const slug = useTenantStore.getState().slug;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (slug) config.headers['X-Tenant-Slug'] = slug;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      try {
        const { data } = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'}/auth/refresh`,
          {},
          { withCredentials: true },
        );
        const token: string = data.data.accessToken;
        useAuthStore.getState().setAccessToken(token);
        error.config.headers.Authorization = `Bearer ${token}`;
        return api(error.config);
      } catch {
        useAuthStore.getState().logout();
        if (typeof window !== 'undefined') window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default api;
```

- [ ] **Step 2: Create `lib/api/auth.api.ts`**

```typescript
import api from '@/lib/api';
import type { ApiResponse, LoginDto, LoginResponse, MeResponse } from '@/types/api.types';

export const authApi = {
  login: (data: LoginDto) =>
    api.post<ApiResponse<LoginResponse>>('/auth/login', data),

  logout: () =>
    api.post<ApiResponse<{ loggedOut: boolean }>>('/auth/logout'),

  me: () =>
    api.get<ApiResponse<MeResponse>>('/auth/me'),

  refresh: () =>
    api.post<ApiResponse<{ accessToken: string }>>('/auth/refresh'),
};
```

- [ ] **Step 3: Verify TypeScript**

```powershell
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```powershell
git add apps/web/lib
git commit -m "feat(web): add Axios API client with auth interceptors"
```

---

## Task 7: Next.js Middleware (Subdomain Routing)

**Files:**
- Create: `apps/web/middleware.ts`

- [ ] **Step 1: Create `middleware.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') ?? '';
  const subdomain = hostname.split('.')[0].split(':')[0];

  const response = NextResponse.next();
  response.headers.set('x-tenant-slug', subdomain);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 2: Commit**

```powershell
git add apps/web/middleware.ts
git commit -m "feat(web): add subdomain middleware for tenant slug header"
```

---

## Task 8: Root Layout + Providers

**Files:**
- Create: `apps/web/app/providers.tsx`
- Modify: `apps/web/app/layout.tsx`

- [ ] **Step 1: Create `app/providers.tsx`**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';
import { authApi } from '@/lib/api/auth.api';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SessionRestorer />
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}

function SessionRestorer() {
  const { accessToken, setAccessToken, setInitialized } = useAuthStore();
  const { slug, setTenant } = useTenantStore();

  useEffect(() => {
    if (accessToken) {
      setInitialized();
      return;
    }

    // Restore tenant slug from subdomain before calling refresh.
    // The Axios interceptor reads slug from Zustand when attaching X-Tenant-Slug.
    if (!slug && typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const subdomain = hostname.split('.')[0].split(':')[0];
      if (subdomain && subdomain !== 'localhost' && subdomain !== 'www') {
        setTenant({ slug: subdomain });
      }
    }

    authApi
      .refresh()
      .then(({ data }) => setAccessToken(data.data.accessToken))
      .catch(() => {})
      .finally(() => setInitialized());
  }, []);

  return null;
}
```

- [ ] **Step 2: Update `app/layout.tsx`**

Replace the full file:

```tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Aaramva Shikshya',
  description: 'Simple school management for every school in Nepal.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```powershell
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```powershell
git add apps/web/app/providers.tsx apps/web/app/layout.tsx
git commit -m "feat(web): add Providers, SessionRestorer, and root layout"
```

---

## Task 9: Auth Layout + Login Page

**Files:**
- Create: `apps/web/app/(auth)/layout.tsx`
- Create: `apps/web/app/(auth)/login/page.tsx`

- [ ] **Step 1: Create `app/(auth)/layout.tsx`**

```tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F8FAF9] flex items-center justify-center p-4">
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create `app/(auth)/login/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { authApi } from '@/lib/api/auth.api';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';
import { Loader2 } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { setAuth } = useAuthStore();
  const { setTenant } = useTenantStore();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginFormValues) {
    setIsLoading(true);
    try {
      const { data } = await authApi.login(values);
      setAuth(data.data.accessToken, data.data.user);
      setTenant(data.data.tenant);
      router.push('/dashboard');
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message ?? 'Invalid email or password';
      toast({ variant: 'destructive', title: 'Login failed', description: message });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-[400px] shadow-sm">
      <CardHeader className="pb-4 flex flex-col items-center gap-2">
        <Image
          src="/logo.jpeg"
          alt="Aaramva Shikshya"
          width={160}
          height={48}
          className="object-contain"
          priority
        />
        <p className="text-sm text-gray-500 mt-1">Sign in to your school</p>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="principal@school.edu.np"
                      autoComplete="email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      autoComplete="current-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full bg-[#1A5C38] hover:bg-[#155030] text-white"
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Copy logo asset to public/**

```powershell
Copy-Item "C:\Users\Srijan Pradhan\Desktop\Projects\images\sikshya.jpeg" "apps/web/public/logo.jpeg"
```

- [ ] **Step 4: Verify TypeScript**

```powershell
npx tsc --noEmit
```

Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/app/'(auth)' apps/web/public/logo.jpeg
git commit -m "feat(web): auth layout and login page with RHF+Zod"
```

---

## Task 10: Shared Atomic Components

**Files:**
- Create: `apps/web/components/shared/bs-date.tsx`
- Create: `apps/web/components/shared/status-badge.tsx`
- Create: `apps/web/components/shared/page-header.tsx`
- Create: `apps/web/components/shared/empty-state.tsx`
- Create: `apps/web/components/shared/confirm-dialog.tsx`

- [ ] **Step 1: Create `components/shared/bs-date.tsx`**

```tsx
import { adToBs, formatBs } from 'bs-calendar';

interface BsDateProps {
  date: string | { ad: string; bs: string };
  showAd?: boolean;
  lang?: 'en' | 'np';
}

export function BsDate({ date, showAd = true, lang = 'en' }: BsDateProps) {
  if (typeof date === 'object') {
    return (
      <span title={showAd ? `AD: ${date.ad}` : undefined}>
        {date.bs}
      </span>
    );
  }
  try {
    const bs = adToBs(new Date(date));
    const formatted = formatBs(bs, lang);
    return <span title={showAd ? `AD: ${date}` : undefined}>{formatted}</span>;
  } catch {
    return <span>{date}</span>;
  }
}
```

- [ ] **Step 2: Create `components/shared/status-badge.tsx`**

```tsx
import { cn } from '@/lib/utils';

const statusStyles: Record<string, string> = {
  PRESENT: 'bg-green-100 text-green-800',
  PAID: 'bg-green-100 text-green-800',
  ACTIVE: 'bg-green-100 text-green-800',
  APPROVED: 'bg-green-100 text-green-800',
  ISSUED: 'bg-green-100 text-green-800',
  ABSENT: 'bg-red-100 text-red-800',
  UNPAID: 'bg-red-100 text-red-800',
  OVERDUE: 'bg-red-100 text-red-800',
  REJECTED: 'bg-red-100 text-red-800',
  LOST: 'bg-red-100 text-red-800',
  LATE: 'bg-yellow-100 text-yellow-800',
  PARTIAL: 'bg-yellow-100 text-yellow-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  LEAVE: 'bg-blue-100 text-blue-800',
  RETURNED: 'bg-gray-100 text-gray-600',
  INACTIVE: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-gray-100 text-gray-600',
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = statusStyles[status] ?? 'bg-gray-100 text-gray-600';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        style,
        className,
      )}
    >
      {status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ')}
    </span>
  );
}
```

- [ ] **Step 3: Create `components/shared/page-header.tsx`**

```tsx
interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        )}
      </div>
      {action && <div className="ml-4 flex-shrink-0">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Create `components/shared/empty-state.tsx`**

```tsx
import { type LucideIcon, Inbox } from 'lucide-react';

interface EmptyStateProps {
  message: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}

export function EmptyState({
  message,
  icon: Icon = Inbox,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="h-12 w-12 text-gray-300 mb-4" strokeWidth={1.5} />
      <p className="text-sm text-gray-500">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 5: Create `components/shared/confirm-dialog.tsx`**

```tsx
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  description: string;
  onConfirm: () => void | Promise<void>;
  trigger: React.ReactNode;
  confirmLabel?: string;
  variant?: 'default' | 'destructive';
}

export function ConfirmDialog({
  title,
  description,
  onConfirm,
  trigger,
  confirmLabel = 'Confirm',
  variant = 'default',
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            className={variant === 'default' ? 'bg-[#1A5C38] hover:bg-[#155030]' : ''}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Verify TypeScript**

```powershell
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/components/shared
git commit -m "feat(web): add BsDate, StatusBadge, PageHeader, EmptyState, ConfirmDialog"
```

---

## Task 11: DataTable Component

**Files:**
- Create: `apps/web/components/shared/data-table.tsx`

- [ ] **Step 1: Create `components/shared/data-table.tsx`**

```tsx
'use client';

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from './empty-state';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

interface DataTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[];
  isLoading?: boolean;
  pagination?: PaginationState;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
}

export function DataTable<TData>({
  columns,
  data,
  isLoading = false,
  pagination,
  onSearchChange,
  searchPlaceholder = 'Search...',
}: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: pagination
      ? Math.ceil(pagination.total / pagination.limit)
      : undefined,
  });

  return (
    <div className="space-y-4">
      {onSearchChange && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder={searchPlaceholder}
            className="pl-9 max-w-sm"
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-gray-50/60 hover:bg-gray-50/60">
                {hg.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="text-xs font-semibold text-gray-500 uppercase tracking-wider"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-[#F8FAF9]">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="p-0">
                  <EmptyState message="No records found" />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && pagination.total > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)}–
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-medium">
              Page {pagination.page}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page * pagination.limit >= pagination.total}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```powershell
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```powershell
git add apps/web/components/shared/data-table.tsx
git commit -m "feat(web): add DataTable with TanStack Table, search, pagination, skeleton"
```

---

## Task 12: Shell Components (Sidebar + Header)

**Files:**
- Create: `apps/web/components/layout/sidebar.tsx`
- Create: `apps/web/components/layout/header.tsx`
- Create: `apps/web/components/layout/school-shell.tsx`

- [ ] **Step 1: Create `components/layout/sidebar.tsx`**

```tsx
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, CheckSquare, BookOpen,
  CreditCard, FileText, UserCog, Library,
  MessageSquare, BookMarked,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';

const NAV_SECTIONS = [
  {
    label: null,
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['all'] },
    ],
  },
  {
    label: 'SCHOOL',
    items: [
      { href: '/students',      icon: Users,         label: 'Students',      roles: ['PRINCIPAL','ACADEMIC_COORDINATOR','TEACHER'] },
      { href: '/attendance',    icon: CheckSquare,   label: 'Attendance',    roles: ['TEACHER','PRINCIPAL','ACADEMIC_COORDINATOR'] },
      { href: '/academic',      icon: BookOpen,      label: 'Academic',      roles: ['PRINCIPAL','ACADEMIC_COORDINATOR'] },
      { href: '/exams',         icon: FileText,      label: 'Examinations',  roles: ['PRINCIPAL','ACADEMIC_COORDINATOR','TEACHER'] },
    ],
  },
  {
    label: 'ADMINISTRATION',
    items: [
      { href: '/finance',       icon: CreditCard,    label: 'Finance',       roles: ['ACCOUNTANT','PRINCIPAL','SCHOOL_OWNER'] },
      { href: '/hr',            icon: UserCog,       label: 'HR & Staff',    roles: ['PRINCIPAL','SCHOOL_OWNER'] },
      { href: '/library',       icon: Library,       label: 'Library',       roles: ['LIBRARIAN','PRINCIPAL'] },
      { href: '/communication', icon: MessageSquare, label: 'Communication', roles: ['PRINCIPAL','TEACHER'] },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const tenant = useTenantStore((s) => s);

  function canSee(roles: string[]) {
    if (roles.includes('all')) return true;
    return user?.role ? roles.includes(user.role) : false;
  }

  return (
    <aside className="flex flex-col w-60 min-h-screen bg-white border-r border-gray-100">
      {/* School logo / name */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-100">
        {tenant.logoUrl ? (
          <Image src={tenant.logoUrl} alt={tenant.name ?? 'School'} width={36} height={36} className="rounded object-contain" />
        ) : (
          <div className="h-9 w-9 rounded bg-[#1A5C38]/10 flex items-center justify-center text-[#1A5C38] font-bold text-sm flex-shrink-0">
            {(tenant.name ?? tenant.slug ?? 'S').slice(0, 2).toUpperCase()}
          </div>
        )}
        <span className="font-semibold text-sm text-gray-900 truncate">
          {tenant.name ?? tenant.slug ?? 'School'}
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label ?? 'main'}>
            {section.label && (
              <p className="px-2 mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                {section.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.filter((i) => canSee(i.roles)).map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                        active
                          ? 'bg-[#1A5C38] text-white'
                          : 'text-gray-600 hover:bg-gray-50',
                      )}
                    >
                      <item.icon className={cn('h-4 w-4 flex-shrink-0', active ? 'text-white' : 'text-gray-400')} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Powered by */}
      <div className="px-4 py-3 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <BookMarked className="h-3 w-3 text-gray-300 flex-shrink-0" />
          <span className="text-[10px] text-gray-400">Powered by Aaramva Shikshya</span>
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Create `components/layout/header.tsx`**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { LogOut, User } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';
import { authApi } from '@/lib/api/auth.api';

export function Header() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const clearTenant = useTenantStore((s) => s.clear);
  const tenantName = useTenantStore((s) => s.name);

  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase()
    : 'U';

  async function handleLogout() {
    try {
      await authApi.logout();
    } finally {
      logout();
      clearTenant();
      router.push('/login');
    }
  }

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-100">
      <div>
        <span className="text-sm font-medium text-gray-700">{tenantName ?? ''}</span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-[#1A5C38] focus:ring-offset-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-[#1A5C38]/10 text-[#1A5C38] text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="hidden sm:block text-sm text-gray-700">
              {user ? `${user.firstName} ${user.lastName}` : 'User'}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem className="text-xs text-gray-500 cursor-default" disabled>
            <User className="mr-2 h-3 w-3" />
            {user?.role?.replace(/_/g, ' ')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer">
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
```

- [ ] **Step 3: Create `components/layout/school-shell.tsx`**

This component is the client-side auth guard. It waits for `SessionRestorer` to finish (via `isInitialized`), then redirects to `/login` if there is no access token.

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { useAuthStore } from '@/store/auth.store';
import { Loader2 } from 'lucide-react';

export function SchoolShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { accessToken, isInitialized } = useAuthStore();

  useEffect(() => {
    if (isInitialized && !accessToken) {
      router.replace('/login');
    }
  }, [isInitialized, accessToken, router]);

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAF9]">
        <Loader2 className="h-6 w-6 text-[#1A5C38] animate-spin" />
      </div>
    );
  }

  if (!accessToken) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAF9]">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript**

```powershell
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/components/layout
git commit -m "feat(web): sidebar, header, and SchoolShell layout components"
```

---

## Task 13: School Auth-Guarded Layout

**Files:**
- Create: `apps/web/app/(school)/layout.tsx`

- [ ] **Step 1: Create `app/(school)/layout.tsx`**

The auth guard is handled client-side in `SchoolShell` (the refresh cookie lives on port 3001 — it's never sent to the Next.js server, so a server-side cookie check would always return false).

```tsx
import { SchoolShell } from '@/components/layout/school-shell';

export default function SchoolLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SchoolShell>{children}</SchoolShell>;
}
```

- [ ] **Step 2: Verify TypeScript**

```powershell
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```powershell
git add "apps/web/app/(school)/layout.tsx"
git commit -m "feat(web): school layout with refresh_token cookie auth guard"
```

---

## Task 14: Dashboard Page

**Files:**
- Create: `apps/web/app/(school)/dashboard/page.tsx`

- [ ] **Step 1: Create `app/(school)/dashboard/page.tsx`**

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { Users, CheckSquare, CreditCard, Bell } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import api from '@/lib/api';
import type { ApiResponse } from '@/types/api.types';

interface StatCardProps {
  title: string;
  icon: React.ElementType;
  value: string | number | undefined;
  isLoading: boolean;
}

function StatCard({ title, icon: Icon, value, isLoading }: StatCardProps) {
  return (
    <Card className="border-gray-100 shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            {isLoading ? (
              <Skeleton className="h-9 w-24 mb-1" />
            ) : (
              <p className="text-3xl font-bold text-[#1A5C38]">{value ?? '—'}</p>
            )}
            <p className="text-sm text-gray-500 mt-1">{title}</p>
          </div>
          <div className="rounded-full bg-[#1A5C38]/10 p-3">
            <Icon className="h-5 w-5 text-[#1A5C38]" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const students = useQuery({
    queryKey: ['dashboard', 'students'],
    queryFn: () =>
      api
        .get<ApiResponse<unknown>>('/students?page=1&limit=1')
        .then((r) => r.data.meta?.total ?? 0),
  });

  const attendance = useQuery({
    queryKey: ['dashboard', 'attendance'],
    queryFn: () =>
      api
        .get<ApiResponse<{ percent: number }>>('/attendance/students/school/summary')
        .then((r) => `${r.data.data?.percent ?? 0}%`),
  });

  const fees = useQuery({
    queryKey: ['dashboard', 'fees'],
    queryFn: () =>
      api
        .get<ApiResponse<{ totalPending: number }>>('/finance/reports/collection')
        .then((r) => {
          const v = r.data.data?.totalPending ?? 0;
          return `Rs. ${v.toLocaleString()}`;
        })
        .catch(() => 'Rs. 0'),
  });

  const notices = useQuery({
    queryKey: ['dashboard', 'notices'],
    queryFn: () =>
      api
        .get<ApiResponse<{ count: number }>>('/communication/notifications/unread-count')
        .then((r) => r.data.data?.count ?? 0),
  });

  return (
    <div>
      <PageHeader title="Dashboard" description="School overview" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Students"
          icon={Users}
          value={students.data}
          isLoading={students.isLoading}
        />
        <StatCard
          title="Today's Attendance"
          icon={CheckSquare}
          value={attendance.data}
          isLoading={attendance.isLoading}
        />
        <StatCard
          title="Pending Fees"
          icon={CreditCard}
          value={fees.data}
          isLoading={fees.isLoading}
        />
        <StatCard
          title="Unread Notices"
          icon={Bell}
          value={notices.data}
          isLoading={notices.isLoading}
        />
      </div>

      <div className="mt-8 rounded-xl border border-gray-100 bg-white p-6">
        <h2 className="text-base font-semibold text-gray-700 mb-2">Recent Activity</h2>
        <p className="text-sm text-gray-400">Activity feed coming in a future session.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```powershell
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```powershell
git add "apps/web/app/(school)/dashboard"
git commit -m "feat(web): dashboard page with 4 stat cards via TanStack Query"
```

---

## Task 15: Placeholder Module Pages

**Files:**
- Create: `apps/web/app/(school)/students/page.tsx`
- Create: `apps/web/app/(school)/attendance/page.tsx`
- Create: `apps/web/app/(school)/academic/page.tsx`
- Create: `apps/web/app/(school)/finance/page.tsx`
- Create: `apps/web/app/(school)/exams/page.tsx`
- Create: `apps/web/app/(school)/hr/page.tsx`
- Create: `apps/web/app/(school)/library/page.tsx`
- Create: `apps/web/app/(school)/communication/page.tsx`

- [ ] **Step 1: Create all 8 placeholder pages**

Each file follows the same pattern. Create one file per module:

**`app/(school)/students/page.tsx`:**
```tsx
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Users } from 'lucide-react';

export default function StudentsPage() {
  return (
    <div>
      <PageHeader title="Students" description="Manage student admissions and profiles" />
      <EmptyState message="Student management is coming in Session 12." icon={Users} />
    </div>
  );
}
```

**`app/(school)/attendance/page.tsx`:**
```tsx
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { CheckSquare } from 'lucide-react';

export default function AttendancePage() {
  return (
    <div>
      <PageHeader title="Attendance" description="Mark and review daily attendance" />
      <EmptyState message="Attendance management is coming in Session 13." icon={CheckSquare} />
    </div>
  );
}
```

**`app/(school)/academic/page.tsx`:**
```tsx
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { BookOpen } from 'lucide-react';

export default function AcademicPage() {
  return (
    <div>
      <PageHeader title="Academic" description="Classes, sections, subjects, and timetable" />
      <EmptyState message="Academic management is coming in Session 15." icon={BookOpen} />
    </div>
  );
}
```

**`app/(school)/finance/page.tsx`:**
```tsx
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { CreditCard } from 'lucide-react';

export default function FinancePage() {
  return (
    <div>
      <PageHeader title="Finance" description="Fee structures, invoices, and payments" />
      <EmptyState message="Finance management is coming in Session 14." icon={CreditCard} />
    </div>
  );
}
```

**`app/(school)/exams/page.tsx`:**
```tsx
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { FileText } from 'lucide-react';

export default function ExamsPage() {
  return (
    <div>
      <PageHeader title="Examinations" description="Exams, marks, and report cards" />
      <EmptyState message="Examination management is coming in Session 15." icon={FileText} />
    </div>
  );
}
```

**`app/(school)/hr/page.tsx`:**
```tsx
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { UserCog } from 'lucide-react';

export default function HrPage() {
  return (
    <div>
      <PageHeader title="HR & Staff" description="Staff profiles, leave, and payroll" />
      <EmptyState message="HR management is coming in Session 16." icon={UserCog} />
    </div>
  );
}
```

**`app/(school)/library/page.tsx`:**
```tsx
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Library } from 'lucide-react';

export default function LibraryPage() {
  return (
    <div>
      <PageHeader title="Library" description="Books, members, and issue/return" />
      <EmptyState message="Library management is coming in Session 16." icon={Library} />
    </div>
  );
}
```

**`app/(school)/communication/page.tsx`:**
```tsx
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { MessageSquare } from 'lucide-react';

export default function CommunicationPage() {
  return (
    <div>
      <PageHeader title="Communication" description="Notices, SMS, and notifications" />
      <EmptyState message="Communication is coming in Session 16." icon={MessageSquare} />
    </div>
  );
}
```

- [ ] **Step 2: Run a full build to confirm everything compiles**

```powershell
npm run build
```

Expected: Build completes with no errors. All 9 routes (dashboard + 8 modules) appear in the route output.

- [ ] **Step 3: Commit**

```powershell
git add "apps/web/app/(school)"
git commit -m "feat(web): placeholder pages for all 8 school modules"
```

---

## Task 16: Final Smoke Test

- [ ] **Step 1: Ensure the backend is running**

In a separate terminal:
```powershell
cd apps/api
npm run start:dev
```

Expected: API starts on port 3001.

- [ ] **Step 2: Start the Next.js dev server**

```powershell
cd apps/web
npm run dev
```

Expected: Next.js starts on http://localhost:3000.

- [ ] **Step 3: Test the login flow**

1. Open http://localhost:3000 in a browser.
2. Should redirect to http://localhost:3000/login (no refresh_token cookie).
3. In the browser DevTools → Application → Cookies, there should be no `refresh_token`.
4. You need to set `X-Tenant-Slug` for local dev. Open DevTools → Console and run:
   ```javascript
   // Note: the tenant slug is sent from Zustand, which gets set after login.
   // For login to work locally, the backend needs the tenant slug.
   // The middleware sets x-tenant-slug to 'localhost' — you need a school with slug 'localhost'
   // OR: use a tool like ModHeader browser extension to set X-Tenant-Slug header.
   ```
   
   **Alternative for local testing:** Set the X-Tenant-Slug header using the ModHeader browser extension or via curl to test the login API directly:
   ```powershell
   curl -X POST http://localhost:3001/api/v1/auth/login `
     -H "Content-Type: application/json" `
     -H "X-Tenant-Slug: <your-school-slug>" `
     -d '{"email":"owner@school.edu.np","password":"YourPassword"}'
   ```
   Expected: `{ "success": true, "data": { "accessToken": "...", "user": {...}, "tenant": { "name": "...", "slug": "...", "logoUrl": null } } }`

5. Log in with a valid school account. The middleware sends `x-tenant-slug: localhost` for local dev. To test with a real tenant, use a custom domain or proxy.

- [ ] **Step 4: Verify the backend all-tests still pass**

```powershell
cd apps/api
npm test
```

Expected: 166 tests passing (164 original + 2 new getMe tests).

- [ ] **Step 5: Final commit**

```powershell
git add .
git commit -m "feat(web): Session 11 complete — frontend foundation, auth, shell, dashboard, shared components"
```

---

## Local Dev Note: Tenant Slug for Login

The Next.js middleware reads the subdomain from `host` and sets `x-tenant-slug`. On `localhost:3000`, the subdomain is `localhost`. The backend's `TenantMiddleware` will try to find a tenant with slug `localhost` — which doesn't exist.

**Solutions for local testing:**
1. **Use a `.hosts` entry:** Add `127.0.0.1 testschool.localhost` to your hosts file, then visit `http://testschool.localhost:3000`. The middleware will read `testschool` as the slug.
2. **Update middleware for dev:** In `middleware.ts`, when hostname is `localhost`, read the slug from a query param or cookie. Add to the middleware:
   ```typescript
   // Dev override: ?tenant=slug in URL
   const devSlug = request.nextUrl.searchParams.get('tenant');
   const slug = devSlug || subdomain;
   response.headers.set('x-tenant-slug', slug);
   ```
   Then visit `http://localhost:3000/login?tenant=yourschoolslug`.

The plan includes option 2 as it requires no system changes. Update `middleware.ts` in Task 7 if needed.
