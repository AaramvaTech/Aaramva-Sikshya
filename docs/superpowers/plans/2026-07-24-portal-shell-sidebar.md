# Portal Shell Sidebar + Parent Content Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the student/parent/teacher portal (`PortalShell`) a real collapsible sidebar matching the admin `SchoolShell`'s visual/structural pattern, fix the `ChildSwitcher` long-name overflow, and fix the oversized attendance calendar + empty space on the parent attendance page.

**Architecture:** New parallel `PortalSidebar` + `PortalHeader` components (not a refactor of the admin `Sidebar`/`Header`), reusing the already-global `SidebarContext` and the existing `menu-item*` CSS utility classes for visual parity. A tiny `SidebarBackdrop` is extracted out of `SchoolShell` so both shells share it. `PortalShell` is restructured to compose these three pieces instead of its current single-header layout. `ChildSwitcher` gets a width/truncation fix. The parent attendance page gets a width-capped calendar in a two-column layout at `xl:` breakpoints.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Zustand, `@base-ui/react` (shadcn-style `Select`), `lucide-react` icons, Vitest + `@testing-library/react` (jsdom).

## Global Constraints

- Shell/sidebar changes apply to all three portal roles (student, parent, teacher) — `PortalShell` is shared. Page-content fixes (calendar sizing, empty space) are scoped to the parent attendance page only, per the locked design scope.
- No backend files touched. No changes to data-fetching, hooks, or the IDOR-verified backend calls behind any of the 7 parent screens (`docs/web/phase-5-idor-audit.md`) — this is a layout/visual pass only.
- `PortalHeader`'s role label MUST read from a local `ROLE_LABELS` constant (`STUDENT`/`PARENT`/`TEACHER` → display string), never from admin's `useRoleLabels()` hook — that hook calls a `TEACHER_AND_ABOVE`-gated HR endpoint that 403s for STUDENT/PARENT (documented WEB-P Phase 1 decision).
- No new features (notification bell, search bar, etc.) — structural/visual parity with `SchoolShell` only.
- Sidebar width/collapse breakpoints must match `SchoolShell`'s `Sidebar` exactly: 290px expanded, 90px collapsed, hover-to-expand, mobile off-canvas.
- This project has no `@testing-library/jest-dom` installed — tests use plain vitest matchers (`.not.toBeNull()`, `.toContain()`) and `document.querySelector('[data-slot="..."]')`, never `.toBeInTheDocument()`.
- Baseline confirmed 2026-07-24 in this exact worktree, before any change in this plan: **320 web tests passing (16 test files)**, `npx tsc --noEmit` clean.
- Full spec: `docs/superpowers/specs/2026-07-24-portal-shell-sidebar-design.md`.

---

### Task 1: Extract shared `SidebarBackdrop`

**Files:**
- Create: `apps/web/components/layout/sidebar-backdrop.tsx`
- Create: `apps/web/components/layout/__tests__/sidebar-backdrop.test.tsx`
- Modify: `apps/web/components/layout/school-shell.tsx:1-24` (remove inline `Backdrop`, import the new shared component), `apps/web/components/layout/school-shell.tsx:109-110` (use `<SidebarBackdrop />`)

**Interfaces:**
- Produces: `SidebarBackdrop` — a zero-prop component, `export function SidebarBackdrop(): JSX.Element | null`. Renders a full-screen click-to-close overlay when `useSidebar().isMobileOpen` is true, otherwise renders nothing. Consumed by both `SchoolShell` (this task) and `PortalShell` (Task 4).

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/layout/__tests__/sidebar-backdrop.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SidebarProvider, useSidebar } from '@/context/sidebar-context';
import { SidebarBackdrop } from '../sidebar-backdrop';

// Shared by SchoolShell and PortalShell — both mobile drawers need a
// click-outside-to-close overlay. Previously an unexported inline function
// inside school-shell.tsx; extracted here so PortalShell can reuse it
// without duplicating the click-to-close logic (WEB-P UI/UX pass,
// docs/superpowers/specs/2026-07-24-portal-shell-sidebar-design.md).

function Harness() {
  const { toggleMobileSidebar } = useSidebar();
  return (
    <>
      <button onClick={toggleMobileSidebar}>toggle</button>
      <SidebarBackdrop />
    </>
  );
}

afterEach(() => {
  cleanup();
});

describe('SidebarBackdrop', () => {
  it('renders nothing when the mobile sidebar is closed', () => {
    render(
      <SidebarProvider>
        <Harness />
      </SidebarProvider>,
    );
    expect(document.querySelector('.fixed.inset-0.z-40')).toBeNull();
  });

  it('renders the overlay once the mobile sidebar opens, and closes it on click', () => {
    render(
      <SidebarProvider>
        <Harness />
      </SidebarProvider>,
    );
    fireEvent.click(screen.getByText('toggle'));
    const overlay = document.querySelector('.fixed.inset-0.z-40');
    expect(overlay).not.toBeNull();

    fireEvent.click(overlay as Element);
    expect(document.querySelector('.fixed.inset-0.z-40')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run components/layout/__tests__/sidebar-backdrop.test.tsx`
Expected: FAIL — `Failed to resolve import "../sidebar-backdrop"` (file doesn't exist yet).

- [ ] **Step 3: Create the component**

Create `apps/web/components/layout/sidebar-backdrop.tsx`:

```tsx
'use client';

import { useSidebar } from '@/context/sidebar-context';

/**
 * Mobile-only overlay that closes the sidebar drawer on tap-outside. Shared
 * by SchoolShell and PortalShell — both mount inside the same global
 * SidebarProvider (apps/web/app/providers.tsx).
 */
export function SidebarBackdrop() {
  const { isMobileOpen, toggleMobileSidebar } = useSidebar();
  if (!isMobileOpen) return null;
  return (
    <div
      className="fixed inset-0 z-40 bg-gray-900/50 lg:hidden"
      onClick={toggleMobileSidebar}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run components/layout/__tests__/sidebar-backdrop.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Update `school-shell.tsx` to use the shared component**

In `apps/web/components/layout/school-shell.tsx`, replace lines 1–24 (imports through the end of the inline `Backdrop` function) with:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { AccessDenied } from './access-denied';
import { SidebarBackdrop } from './sidebar-backdrop';
import { useAuthStore } from '@/store/auth.store';
import { useSidebar } from '@/context/sidebar-context';
import { useOnboardingStatus } from '@/lib/hooks/use-onboarding';
import { canAccess, homeRoute } from '@/lib/route-access';
```

Then, in the same file's render return (originally around line 109–110), replace:

```tsx
      <Sidebar />
      <Backdrop />
```

with:

```tsx
      <Sidebar />
      <SidebarBackdrop />
```

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run: `cd apps/web && npx vitest run`
Expected: PASS — 322 tests (320 baseline + 2 new), 17 test files.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/layout/sidebar-backdrop.tsx apps/web/components/layout/__tests__/sidebar-backdrop.test.tsx apps/web/components/layout/school-shell.tsx
git commit -m "refactor(web): extract shared SidebarBackdrop from SchoolShell

Mechanical extraction, zero behavior change — makes the mobile-drawer
overlay reusable by the upcoming PortalSidebar (WEB-P UI/UX pass)."
```

---

### Task 2: `PortalSidebar` component

**Files:**
- Create: `apps/web/components/layout/portal-sidebar.tsx`
- Create: `apps/web/components/layout/__tests__/portal-sidebar.test.tsx`

**Interfaces:**
- Consumes: `useSidebar()` (`@/context/sidebar-context`) — `{ isExpanded, isMobileOpen, isHovered, setIsHovered }`. `useTenantStore()` (`@/store/tenant.store`) — `{ name, logoUrl }` fields read via the whole-store selector `(s) => s`. `useAuthStore((s) => s.user?.role)` (`@/store/auth.store`) for `Role | undefined`. `homeRoute(role)` from `@/lib/route-access`.
- Produces: `export function PortalSidebar(): JSX.Element`. `export const TEACHER_NAV_ITEMS`, `export const STUDENT_NAV_ITEMS`, `export const PARENT_NAV_ITEMS`: `{ href: string; label: string; icon: LucideIcon }[]` — consumed by Task 4 (`PortalShell` no longer defines these itself) and by this task's own tests.

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/layout/__tests__/portal-sidebar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SidebarProvider } from '@/context/sidebar-context';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';
import { PortalSidebar, TEACHER_NAV_ITEMS, STUDENT_NAV_ITEMS, PARENT_NAV_ITEMS } from '../portal-sidebar';

let mockPathname = '/parent';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

function renderSidebar() {
  return render(
    <SidebarProvider>
      <PortalSidebar />
    </SidebarProvider>,
  );
}

function setUser(role: 'STUDENT' | 'PARENT' | 'TEACHER') {
  useAuthStore.setState({
    accessToken: 'token',
    isInitialized: true,
    user: {
      id: 'u1',
      email: 'user@demo.school',
      role,
      tenantId: 't1',
      tenantSlug: 'demo',
    },
  });
}

beforeEach(() => {
  useTenantStore.setState({
    slug: 'demo',
    name: 'Demo School',
    logoUrl: null,
    primaryColor: null,
    primaryForeground: null,
  });
});

afterEach(() => {
  cleanup();
});

describe('PortalSidebar — role-scoped nav (WEB-P UI/UX pass)', () => {
  it('renders exactly the PARENT nav items for a PARENT user', () => {
    setUser('PARENT');
    mockPathname = '/parent';
    renderSidebar();
    for (const item of PARENT_NAV_ITEMS) {
      expect(screen.getByText(item.label)).not.toBeNull();
    }
    expect(screen.queryByText('Payroll')).toBeNull();
  });

  it('renders exactly the STUDENT nav items for a STUDENT user', () => {
    setUser('STUDENT');
    mockPathname = '/student';
    renderSidebar();
    for (const item of STUDENT_NAV_ITEMS) {
      expect(screen.getByText(item.label)).not.toBeNull();
    }
    expect(screen.queryByText('Fees')).toBeNull();
  });

  it('renders exactly the TEACHER nav items for a TEACHER user', () => {
    setUser('TEACHER');
    mockPathname = '/teacher';
    renderSidebar();
    for (const item of TEACHER_NAV_ITEMS) {
      expect(screen.getByText(item.label)).not.toBeNull();
    }
    expect(screen.queryByText('Fees')).toBeNull();
  });

  it('marks only the current route active, not every sub-route under the role home path', () => {
    setUser('PARENT');
    mockPathname = '/parent/attendance';
    renderSidebar();
    const attendanceLink = screen.getByText('Attendance').closest('a');
    const dashboardLink = screen.getByText('Dashboard').closest('a');
    expect(attendanceLink?.className).toContain('menu-item-active');
    expect(dashboardLink?.className).toContain('menu-item-inactive');
  });

  it('links the logo to the role home route', () => {
    setUser('TEACHER');
    mockPathname = '/teacher/marks';
    renderSidebar();
    const logoLink = screen.getByText('Demo School').closest('a');
    expect(logoLink?.getAttribute('href')).toBe('/teacher');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run components/layout/__tests__/portal-sidebar.test.tsx`
Expected: FAIL — `Failed to resolve import "../portal-sidebar"`.

- [ ] **Step 3: Implement `PortalSidebar`**

Create `apps/web/components/layout/portal-sidebar.tsx`:

```tsx
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CheckSquare,
  FileText,
  ClipboardList,
  User,
  CalendarOff,
  CalendarDays,
  Wallet,
  Bell,
  GraduationCap,
  CreditCard,
  type LucideIcon,
} from 'lucide-react';
import { useSidebar } from '@/context/sidebar-context';
import { useTenantStore } from '@/store/tenant.store';
import { useAuthStore } from '@/store/auth.store';
import { homeRoute } from '@/lib/route-access';
import type { Role } from '@/types/api.types';

type PortalNavItem = { href: string; label: string; icon: LucideIcon };

/** WEB-P Phase 2 Task 1 nav items, moved here from portal-shell.tsx and
 *  given icons as part of the WEB-P UI/UX pass sidebar rework
 *  (docs/superpowers/specs/2026-07-24-portal-shell-sidebar-design.md). */
export const TEACHER_NAV_ITEMS: PortalNavItem[] = [
  { href: '/teacher', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/teacher/attendance', label: 'Attendance', icon: CheckSquare },
  { href: '/teacher/marks', label: 'Marks', icon: FileText },
  { href: '/teacher/assignments', label: 'Assignments', icon: ClipboardList },
  { href: '/teacher/profile', label: 'Profile', icon: User },
  { href: '/teacher/leave', label: 'Leave', icon: CalendarOff },
  { href: '/teacher/timetable', label: 'Timetable', icon: CalendarDays },
  { href: '/teacher/payroll', label: 'Payroll', icon: Wallet },
];

/** WEB-P Phase 4 Task 10 nav items, moved here (see TEACHER_NAV_ITEMS note). */
export const STUDENT_NAV_ITEMS: PortalNavItem[] = [
  { href: '/student', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/student/attendance', label: 'Attendance', icon: CheckSquare },
  { href: '/student/timetable', label: 'Timetable', icon: CalendarDays },
  { href: '/student/notices', label: 'Notices', icon: Bell },
  { href: '/student/results', label: 'Results', icon: GraduationCap },
  { href: '/student/assignments', label: 'Assignments', icon: ClipboardList },
];

/** WEB-P Phase 5 Task 10 nav items, moved here (see TEACHER_NAV_ITEMS note). */
export const PARENT_NAV_ITEMS: PortalNavItem[] = [
  { href: '/parent', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/parent/attendance', label: 'Attendance', icon: CheckSquare },
  { href: '/parent/timetable', label: 'Timetable', icon: CalendarDays },
  { href: '/parent/notices', label: 'Notices', icon: Bell },
  { href: '/parent/results', label: 'Results', icon: GraduationCap },
  { href: '/parent/assignments', label: 'Assignments', icon: ClipboardList },
  { href: '/parent/fees', label: 'Fees', icon: CreditCard },
];

function navItemsFor(role: Role | null | undefined): PortalNavItem[] {
  if (role === 'TEACHER') return TEACHER_NAV_ITEMS;
  if (role === 'STUDENT') return STUDENT_NAV_ITEMS;
  if (role === 'PARENT') return PARENT_NAV_ITEMS;
  return [];
}

const HOME_PATHS = ['/student', '/parent', '/teacher'];

/**
 * New parallel sidebar for the student/parent/teacher portal (WEB-P UI/UX
 * pass — see docs/superpowers/specs/2026-07-24-portal-shell-sidebar-design.md
 * for why this is a new component rather than a reuse/refactor of the admin
 * Sidebar). Reuses the same SidebarContext and menu-item* CSS utility
 * classes as the admin Sidebar for visual parity, with its own simpler flat
 * nav (no sub-items, no onboarding "Setup" entry — neither applies here).
 */
export function PortalSidebar() {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();
  const tenant = useTenantStore((s) => s);
  const role = useAuthStore((s) => s.user?.role);
  const navItems = navItemsFor(role);
  const showLabels = isExpanded || isHovered || isMobileOpen;

  function isActive(href: string) {
    if (pathname === href) return true;
    // A role's own home path (e.g. "/parent") must only match itself —
    // otherwise every page in the portal would show Dashboard as active.
    if (HOME_PATHS.includes(href)) return false;
    return pathname.startsWith(href + '/');
  }

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200
        ${showLabels ? 'w-[290px]' : 'w-[90px]'}
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`py-8 flex ${!showLabels ? 'lg:justify-center' : 'justify-start'}`}>
        <Link href={homeRoute(role)} className="flex items-center gap-3 min-w-0">
          {tenant.logoUrl ? (
            // A school logo is tenant data whose host is not knowable at build
            // time — matches the admin Sidebar's identical handling.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tenant.logoUrl}
              alt={tenant.name ?? 'School'}
              width={36}
              height={36}
              className="h-9 w-9 rounded-lg object-contain flex-shrink-0"
            />
          ) : (
            <Image
              src="/icon.png"
              alt="Aaramva Shikshya"
              width={36}
              height={36}
              className="object-contain flex-shrink-0"
              priority
            />
          )}
          {showLabels && (
            <div className="min-w-0">
              <span className="block font-semibold text-sm text-gray-900 dark:text-white truncate">
                {tenant.name ?? 'Aaramva Shikshya'}
              </span>
              {!tenant.name && (
                <span className="block text-[10px] text-gray-400 uppercase tracking-widest">
                  Portal
                </span>
              )}
            </div>
          )}
        </Link>
      </div>

      <div className="flex flex-col overflow-y-auto flex-1 duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                  !showLabels ? 'lg:justify-center' : 'justify-start'
                }`}
              >
                {showLabels ? 'Menu' : (
                  <span className="w-5 h-[3px] rounded-full bg-gray-400 block" />
                )}
              </h2>
              <ul className="flex flex-col gap-4">
                {navItems.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`menu-item group ${active ? 'menu-item-active' : 'menu-item-inactive'}`}
                      >
                        <span className={active ? 'menu-item-icon-active' : 'menu-item-icon-inactive'}>
                          <Icon className="w-5 h-5" />
                        </span>
                        {showLabels && <span className="menu-item-text">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </nav>
      </div>

      <div className={`py-4 border-t border-gray-100 dark:border-gray-800 flex items-center ${showLabels ? 'justify-start gap-2 px-2' : 'justify-center'}`}>
        {showLabels ? (
          <>
            <span className="text-[10px] text-gray-400 uppercase tracking-widest font-medium whitespace-nowrap">
              Powered by
            </span>
            <Image src="/logo.png" alt="Aaramva Shikshya" width={110} height={28} className="object-contain" />
          </>
        ) : (
          <div className="relative h-7 w-7 overflow-hidden">
            <Image src="/logo.png" alt="Aaramva Shikshya" fill className="object-cover object-left" />
          </div>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run components/layout/__tests__/portal-sidebar.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/layout/portal-sidebar.tsx apps/web/components/layout/__tests__/portal-sidebar.test.tsx
git commit -m "feat(web): add PortalSidebar for the student/parent/teacher portal

New parallel sidebar (not a reuse of the admin Sidebar — see the design
doc for why) reusing SidebarContext and the existing menu-item* CSS
utilities for visual parity. Not yet wired into PortalShell (Task 4)."
```

---

### Task 3: `PortalHeader` component

**Files:**
- Create: `apps/web/components/layout/portal-header.tsx`
- Create: `apps/web/components/layout/__tests__/portal-header.test.tsx`

**Interfaces:**
- Consumes: `useSidebar()` — `{ isMobileOpen, toggleSidebar, toggleMobileSidebar }`. `useAuthStore()` — `{ user, logout }`. `useTenantStore((s) => s.clear)`. `useLocaleStore()` — `{ locale, setLocale }`. `useParentStore((s) => s.clear)`. `authApi.logout()` (`@/lib/api/auth.api`). `ChildSwitcher` (`@/components/parent/child-switcher`, unchanged import — Task 5 only edits its internals).
- Produces: `export function PortalHeader(): JSX.Element`, consumed by Task 4.

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/layout/__tests__/portal-header.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { SidebarProvider } from '@/context/sidebar-context';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';
import { useParentStore } from '@/store/parent.store';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/lib/api/auth.api', () => ({
  authApi: { logout: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/components/parent/child-switcher', () => ({
  ChildSwitcher: () => <div data-testid="child-switcher" />,
}));

import { authApi } from '@/lib/api/auth.api';
import { PortalHeader } from '../portal-header';

function setUser(role: 'STUDENT' | 'PARENT' | 'TEACHER') {
  useAuthStore.setState({
    accessToken: 'token',
    isInitialized: true,
    user: {
      id: 'u1',
      email: 'user@demo.school',
      firstName: 'Sam',
      lastName: 'Reader',
      role,
      tenantId: 't1',
      tenantSlug: 'demo',
    },
  });
}

function renderHeader() {
  return render(
    <SidebarProvider>
      <PortalHeader />
    </SidebarProvider>,
  );
}

beforeEach(() => {
  useTenantStore.setState({
    slug: 'demo',
    name: 'Demo School',
    logoUrl: null,
    primaryColor: null,
    primaryForeground: null,
  });
  useParentStore.setState({ selectedChildId: null });
  mockPush.mockReset();
  (authApi.logout as unknown as ReturnType<typeof vi.fn>).mockClear();
});

afterEach(() => {
  cleanup();
});

describe('PortalHeader — WEB-P UI/UX pass', () => {
  it('shows the ChildSwitcher for PARENT but not for STUDENT or TEACHER', () => {
    setUser('PARENT');
    renderHeader();
    expect(screen.getByTestId('child-switcher')).not.toBeNull();
    cleanup();

    setUser('STUDENT');
    renderHeader();
    expect(screen.queryByTestId('child-switcher')).toBeNull();
    cleanup();

    setUser('TEACHER');
    renderHeader();
    expect(screen.queryByTestId('child-switcher')).toBeNull();
  });

  it('shows the role label from the local ROLE_LABELS map (not a staff-only lookup) for STUDENT', () => {
    setUser('STUDENT');
    renderHeader();
    fireEvent.click(screen.getByText('Sam Reader'));
    expect(screen.getByText('Student')).not.toBeNull();
  });

  it('signs out through the full cleanup sequence when the menu sign-out button is clicked', async () => {
    setUser('TEACHER');
    renderHeader();
    fireEvent.click(screen.getByText('Sam Reader'));
    fireEvent.click(screen.getByText('Sign out'));

    await waitFor(() => {
      expect(authApi.logout).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState().accessToken).toBeNull();
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run components/layout/__tests__/portal-header.test.tsx`
Expected: FAIL — `Failed to resolve import "../portal-header"`.

- [ ] **Step 3: Implement `PortalHeader`**

Create `apps/web/components/layout/portal-header.tsx`:

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import { useSidebar } from '@/context/sidebar-context';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';
import { useLocaleStore } from '@/store/locale.store';
import { useParentStore } from '@/store/parent.store';
import { authApi } from '@/lib/api/auth.api';
import { ChildSwitcher } from '@/components/parent/child-switcher';
import type { Role } from '@/types/api.types';

// Kept local and separate from admin's useRoleLabels() hook on purpose: that
// hook calls a TEACHER_AND_ABOVE-gated HR endpoint that 403s for STUDENT/
// PARENT (documented WEB-P Phase 1 decision — do not "simplify" this back
// to useRoleLabels() when copying admin's UserMenu pattern).
const ROLE_LABELS: Partial<Record<Role, string>> = {
  STUDENT: 'Student',
  PARENT: 'Parent',
  TEACHER: 'Teacher',
};

function UserMenu() {
  const router = useRouter();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const clearTenant = useTenantStore((s) => s.clear);
  const clearSelectedChild = useParentStore((s) => s.clear);
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const displayName = user
    ? user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.email
    : 'User';

  const initials = user
    ? user.firstName && user.lastName
      ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
      : user.email.slice(0, 2).toUpperCase()
    : 'U';

  const roleLabel = user?.role ? ROLE_LABELS[user.role] ?? user.role : '';

  async function handleLogout() {
    try {
      await authApi.logout();
    } finally {
      logout();
      clearTenant();
      // Mirrors PortalShell's pre-existing logout hygiene: a same-tab login
      // as a different parent must not inherit the prior parent's selection.
      clearSelectedChild();
      router.push('/login');
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((p) => !p);
        }}
        className="flex items-center gap-2 text-gray-700 dark:text-gray-400"
      >
        <span className="flex items-center justify-center h-10 w-10 rounded-full bg-brand-500 text-white text-sm font-semibold">
          {initials}
        </span>
        <span className="hidden md:block text-theme-sm font-medium">{displayName}</span>
        <svg
          className={`stroke-gray-500 dark:stroke-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          width="16"
          height="16"
          viewBox="0 0 18 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M4.3125 8.65625L9 13.3437L13.6875 8.65625" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-4 w-60 flex flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900 z-9999">
          <div className="mb-3">
            <span className="block font-medium text-gray-700 text-theme-sm dark:text-gray-300">
              {displayName}
            </span>
            <span className="block text-theme-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {roleLabel}
            </span>
          </div>
          <div className="border-t border-gray-200 dark:border-gray-800 pt-3">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-2 font-medium text-gray-700 rounded-lg text-theme-sm hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300 transition-colors"
            >
              {t('actions.signOut')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * New slim header for the student/parent/teacher portal (WEB-P UI/UX pass),
 * replacing PortalShell's previous single-bar header that crammed nav links
 * + ChildSwitcher + language toggle + role pill + sign-out into one row.
 * Nav links now live in PortalSidebar; this header mirrors admin Header.tsx's
 * shape (sidebar toggle left, actions right).
 */
export function PortalHeader() {
  const { isMobileOpen, toggleSidebar, toggleMobileSidebar } = useSidebar();
  const { locale, setLocale } = useLocaleStore();
  const role = useAuthStore((s) => s.user?.role);

  function handleToggle() {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      toggleSidebar();
    } else {
      toggleMobileSidebar();
    }
  }

  return (
    <header className="sticky top-0 flex w-full bg-white border-gray-200 z-9999 dark:border-gray-800 dark:bg-gray-900 lg:border-b">
      <div className="flex flex-col items-center justify-between grow lg:flex-row lg:px-6">
        <div className="flex items-center justify-between w-full gap-2 px-3 py-3 border-b border-gray-200 dark:border-gray-800 sm:gap-4 lg:justify-normal lg:border-b-0 lg:px-0 lg:py-4">
          <div className="flex items-center gap-2 lg:hidden">
            <Image src="/icon.png" alt="Aaramva Shikshya" width={28} height={28} className="object-contain" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Aaramva Shikshya</span>
          </div>

          <button
            onClick={handleToggle}
            className="items-center justify-center w-10 h-10 text-gray-500 border border-gray-200 rounded-lg z-9999 dark:border-gray-800 lg:flex dark:text-gray-400 lg:h-11 lg:w-11 lg:border hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Toggle Sidebar"
          >
            {isMobileOpen ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" clipRule="evenodd" d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z" fill="currentColor" />
              </svg>
            ) : (
              <svg width="16" height="12" viewBox="0 0 16 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" clipRule="evenodd" d="M0.583252 1C0.583252 0.585788 0.919038 0.25 1.33325 0.25H14.6666C15.0808 0.25 15.4166 0.585786 15.4166 1C15.4166 1.41421 15.0808 1.75 14.6666 1.75L1.33325 1.75C0.919038 1.75 0.583252 1.41422 0.583252 1ZM0.583252 11C0.583252 10.5858 0.919038 10.25 1.33325 10.25L14.6666 10.25C15.0808 10.25 15.4166 10.5858 15.4166 11C15.4166 11.4142 15.0808 11.75 14.6666 11.75L1.33325 11.75C0.919038 11.75 0.583252 11.4142 0.583252 11ZM1.33325 5.25C0.919038 5.25 0.583252 5.58579 0.583252 6C0.583252 6.41421 0.919038 6.75 1.33325 6.75L7.99992 6.75C8.41413 6.75 8.74992 6.41421 8.74992 6C8.74992 5.58579 8.41413 5.25 7.99992 5.25L1.33325 5.25Z" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>

        <div className="flex items-center justify-between w-full gap-4 px-5 py-4 lg:flex lg:justify-end lg:px-0">
          <div className="flex items-center gap-3">
            {role === 'PARENT' && <ChildSwitcher />}
            <div className="flex items-center rounded-full border border-gray-200 p-0.5 text-xs font-medium dark:border-gray-700">
              <button
                onClick={() => setLocale('en')}
                aria-pressed={locale === 'en'}
                className={
                  locale === 'en'
                    ? 'rounded-full bg-brand-50 px-2 py-1 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400'
                    : 'rounded-full px-2 py-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }
              >
                EN
              </button>
              <button
                onClick={() => setLocale('np')}
                aria-pressed={locale === 'np'}
                className={
                  locale === 'np'
                    ? 'rounded-full bg-brand-50 px-2 py-1 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400'
                    : 'rounded-full px-2 py-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }
              >
                नेपाली
              </button>
            </div>
          </div>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run components/layout/__tests__/portal-header.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/layout/portal-header.tsx apps/web/components/layout/__tests__/portal-header.test.tsx
git commit -m "feat(web): add PortalHeader with consolidated user-menu dropdown

Replaces the old single-bar header's separate role pill + plain sign-out
button with one dropdown (avatar initials, name, role, sign out) matching
admin Header.tsx's UserMenu pattern. Role label reads from a local
ROLE_LABELS map, not admin's staff-only useRoleLabels() hook. Not yet
wired into PortalShell (Task 4)."
```

---

### Task 4: Restructure `PortalShell` to compose Sidebar + Header + Backdrop

**Files:**
- Modify: `apps/web/components/layout/portal-shell.tsx` (full rewrite of the render — auth-gating effects unchanged)
- Create: `apps/web/components/layout/__tests__/portal-shell.test.tsx`

**Interfaces:**
- Consumes: `PortalSidebar` (Task 2), `PortalHeader` (Task 3), `SidebarBackdrop` (Task 1), `useSidebar()` for the margin computation, `canAccess` from `@/lib/route-access` (unchanged).
- Produces: `export function PortalShell({ children }: { children: React.ReactNode }): JSX.Element` — same public signature as before; internal layout changes only.

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/layout/__tests__/portal-shell.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SidebarProvider } from '@/context/sidebar-context';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';
import { PortalShell } from '../portal-shell';

const mockReplace = vi.fn();
let mockPathname = '/student';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  usePathname: () => mockPathname,
}));

function renderShell(pathname: string) {
  mockPathname = pathname;
  return render(
    <SidebarProvider>
      <PortalShell>
        <div>Page Content</div>
      </PortalShell>
    </SidebarProvider>,
  );
}

beforeEach(() => {
  mockReplace.mockReset();
  useAuthStore.setState({
    accessToken: 'token-123',
    isInitialized: true,
    user: {
      id: 'u1',
      email: 'student@demo.school',
      firstName: 'Sam',
      lastName: 'Reader',
      role: 'STUDENT',
      tenantId: 't1',
      tenantSlug: 'demo',
      mustChangePassword: false,
    },
  });
  useTenantStore.setState({
    slug: 'demo',
    name: 'Demo School',
    logoUrl: null,
    primaryColor: null,
    primaryForeground: null,
  });
});

afterEach(() => {
  cleanup();
});

describe('PortalShell — sidebar/header restructure preserves access gating (WEB-P UI/UX pass)', () => {
  it('renders a real <aside> sidebar (not the old inline header nav) alongside page content when the role can access the path', () => {
    renderShell('/student');
    expect(screen.getByText('Page Content')).not.toBeNull();
    // The concrete, new-vs-old signal for this task: the old PortalShell had
    // no <aside> at all (a single <header> with inline nav links). Only the
    // new PortalSidebar introduces one.
    expect(document.querySelector('aside')).not.toBeNull();
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
  });

  it('renders AccessDenied instead of children when the role cannot access the path (pre-existing behavior, must survive the restructure)', () => {
    useAuthStore.setState((s) => ({
      user: s.user ? { ...s.user, role: 'TEACHER' } : s.user,
    }));
    renderShell('/student');
    expect(screen.queryByText('Page Content')).toBeNull();
    expect(screen.getByText(/don.t have access to this section/i)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run components/layout/__tests__/portal-shell.test.tsx`
Expected: FAIL — specifically on `expect(document.querySelector('aside')).not.toBeNull()` in the first test: the pre-rework `PortalShell` has no `<aside>` element (just a `<header>` with inline nav links), so this is `null`. The `Page Content`/`Dashboard`/`AccessDenied` assertions in both tests already pass against the old markup (it already rendered nav labels and already used `AccessDenied`) — the `<aside>` check is the one genuinely new-vs-old assertion this step proves.

- [ ] **Step 3: Rewrite `PortalShell`**

Replace the entire contents of `apps/web/components/layout/portal-shell.tsx` with:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useSidebar } from '@/context/sidebar-context';
import { canAccess } from '@/lib/route-access';
import { AccessDenied } from './access-denied';
import { PortalSidebar } from './portal-sidebar';
import { PortalHeader } from './portal-header';
import { SidebarBackdrop } from './sidebar-backdrop';

/**
 * WEB-P Phase 1 Task 2 — the shared shell for the student/parent/teacher
 * portal. Follows the same session-hydration + access-gate pattern as
 * SchoolShell (apps/web/components/layout/school-shell.tsx).
 *
 * WEB-P UI/UX pass (2026-07-24, see docs/superpowers/specs/2026-07-24-
 * portal-shell-sidebar-design.md): now mirrors SchoolShell's collapsible-
 * sidebar layout shape too — PortalSidebar + PortalHeader + SidebarBackdrop,
 * reusing the same SidebarContext SchoolShell uses. Per-role nav items and
 * the header's sign-out/role-menu now live in portal-sidebar.tsx /
 * portal-header.tsx (moved out of this file).
 */
export function PortalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, isInitialized, user } = useAuthStore();
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();

  useEffect(() => {
    if (isInitialized && !accessToken) {
      router.replace('/login');
    }
  }, [isInitialized, accessToken, router]);

  // POL-1 T4 — a user on an emailed temporary password cannot use any
  // authenticated shell, portal included, until they set their own.
  // /change-password lives in the (auth) group (no shell), so this effect
  // cannot loop; logout stays reachable from the header's user menu.
  useEffect(() => {
    if (isInitialized && accessToken && user?.mustChangePassword) {
      router.replace('/change-password');
    }
  }, [isInitialized, accessToken, user?.mustChangePassword, router]);

  // Loader until the session is fully hydrated — including the brief window
  // where the token is set but the user's role hasn't loaded yet (refresh in
  // flight) — so the 403 screen never flashes before the role is known.
  if (!isInitialized || (accessToken && !user?.role)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-gray-900">
        <Image src="/logo.png" alt="Aaramva Shikshya" width={180} height={46} className="object-contain" priority />
        <Loader2 className="h-5 w-5 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (!accessToken) return null;

  const allowed = canAccess(user?.role, pathname);

  const mainMargin = isMobileOpen
    ? 'ml-0'
    : isExpanded || isHovered
    ? 'lg:ml-[290px]'
    : 'lg:ml-[90px]';

  return (
    <div className="flex h-screen overflow-hidden">
      <PortalSidebar />
      <SidebarBackdrop />
      <div
        className={`relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden bg-gray-50 transition-all duration-300 ease-in-out dark:bg-gray-900 ${mainMargin}`}
      >
        <PortalHeader />
        <main>
          <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
            {allowed ? children : <AccessDenied role={user?.role} />}
          </div>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run components/layout/__tests__/portal-shell.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `cd apps/web && npx vitest run`
Expected: PASS — 332 tests (320 baseline + 2 SidebarBackdrop + 5 PortalSidebar + 3 PortalHeader + 2 PortalShell), 20 test files.

- [ ] **Step 6: Run tsc to confirm no type errors**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean, no output.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/layout/portal-shell.tsx apps/web/components/layout/__tests__/portal-shell.test.tsx
git commit -m "refactor(web): wire PortalSidebar + PortalHeader into PortalShell

Replaces the single-header layout with a collapsible sidebar matching
SchoolShell's structure (flex h-screen root, margin-shifted content
column, SidebarBackdrop). Auth-gating effects, the hydration loader, and
canAccess/AccessDenied routing are unchanged — layout only."
```

---

### Task 5: `ChildSwitcher` long-name fix

**Files:**
- Modify: `apps/web/components/parent/child-switcher.tsx`
- Create: `apps/web/components/parent/__tests__/child-switcher.test.tsx`

**Interfaces:**
- Consumes: `useSelectedChild()` (`@/lib/hooks/use-selected-child`) — unchanged hook, only this component's consumption of its return value changes (still reads `children`, `selectedChildId`, `setSelectedChild`, `isLoading`).
- No change to the component's exported signature (`export function ChildSwitcher(): JSX.Element | null`).

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/parent/__tests__/child-switcher.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useSelectedChild } from '@/lib/hooks/use-selected-child';
import { ChildSwitcher } from '../child-switcher';

vi.mock('@/lib/hooks/use-selected-child', () => ({
  useSelectedChild: vi.fn(),
}));

const mockUseSelectedChild = useSelectedChild as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  cleanup();
});

describe('ChildSwitcher — long-name truncation (WEB-P UI/UX pass)', () => {
  it('truncates a long single-child name behind a title tooltip instead of overflowing', () => {
    mockUseSelectedChild.mockReturnValue({
      children: [{ id: 'c1', firstName: 'Aishwarya-Kumari', lastName: 'Bahadur-Shrestha-Thapa' }],
      selectedChildId: 'c1',
      setSelectedChild: vi.fn(),
      isLoading: false,
    });

    render(<ChildSwitcher />);

    const label = screen.getByText('Aishwarya-Kumari Bahadur-Shrestha-Thapa');
    expect(label.className).toContain('truncate');
    expect(label.getAttribute('title')).toBe('Aishwarya-Kumari Bahadur-Shrestha-Thapa');
  });

  it('widens the trigger and exposes the full name via title when multiple children exist', () => {
    mockUseSelectedChild.mockReturnValue({
      children: [
        { id: 'c1', firstName: 'Aishwarya-Kumari', lastName: 'Bahadur-Shrestha-Thapa' },
        { id: 'c2', firstName: 'Ravi', lastName: 'Thapa' },
      ],
      selectedChildId: 'c1',
      setSelectedChild: vi.fn(),
      isLoading: false,
    });

    render(<ChildSwitcher />);

    const trigger = document.querySelector('[data-slot="select-trigger"]') as HTMLElement;
    expect(trigger).not.toBeNull();
    expect(trigger.className).toContain('w-56');
    expect(trigger.getAttribute('title')).toBe('Aishwarya-Kumari Bahadur-Shrestha-Thapa');
    expect(screen.getByText('Aishwarya-Kumari Bahadur-Shrestha-Thapa').className).toContain('truncate');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run components/parent/__tests__/child-switcher.test.tsx`
Expected: FAIL — trigger has no `title` attribute, name span has no `truncate` class, trigger width is `w-48` not `w-56`.

- [ ] **Step 3: Fix `ChildSwitcher`**

In `apps/web/components/parent/child-switcher.tsx`, replace the body of the component from `if (children.length === 1)` through the end of the `return` (the whole multi-child `Select` block) with:

```tsx
  if (children.length === 1) {
    const fullName = `${children[0].firstName} ${children[0].lastName}`;
    return (
      <span
        className="block max-w-[180px] truncate text-sm font-medium text-gray-700 dark:text-gray-200"
        title={fullName}
      >
        {fullName}
      </span>
    );
  }

  const selected = children.find((c) => c.id === selectedChildId);
  const selectedName = selected ? `${selected.firstName} ${selected.lastName}` : 'Select child';

  return (
    <Select value={selectedChildId ?? ''} onValueChange={(v) => v && setSelectedChild(v)}>
      <SelectTrigger className="h-9 w-56 sm:w-64" title={selectedName}>
        <span className="block truncate">{selectedName}</span>
      </SelectTrigger>
      <SelectContent>
        {children.map((c) => {
          const label = c.currentEnrollment
            ? `${c.firstName} ${c.lastName} — ${c.currentEnrollment.className} ${c.currentEnrollment.sectionName}`
            : `${c.firstName} ${c.lastName}`;
          return (
            <SelectItem key={c.id} value={c.id} title={label}>
              <span className="block max-w-[280px] truncate">{label}</span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
```

(The `isLoading`/`children.length === 0` early returns above this block, and every hook/import at the top of the file, are unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run components/parent/__tests__/child-switcher.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `cd apps/web && npx vitest run`
Expected: PASS — 334 tests (332 from Task 4 + 2 new), 21 test files.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/parent/child-switcher.tsx apps/web/components/parent/__tests__/child-switcher.test.tsx
git commit -m "fix(web): ChildSwitcher truncates long names instead of overflowing

Widens the trigger (w-48 -> w-56/w-64) and adds truncate + title tooltip
on the trigger's name span, the single-child label, and each dropdown
row's enrollment-suffixed label."
```

---

### Task 6: Cap the parent attendance calendar width + two-column layout

**Files:**
- Modify: `apps/web/app/(portal)/parent/attendance/page.tsx` (JSX structure only — no hook, prop, or handler changes)

**Interfaces:**
- No interface changes — every hook call, guard branch, and sub-component (`LeaveRequestForm`, `CountTile`, `formatLocalDateAd`) is unchanged. Only the wrapping JSX inside the final `return` statement changes.

This task has no new automated test. The change is Tailwind layout classes only (no new conditional logic), and the page's correctness was verified live (HTTP + Postgres, not component tests) during WEB-P Phase 5 per `docs/web/phase-5-findings.md` — consistent with that precedent and the design spec's §7, verification here is `tsc --noEmit` plus the full suite (to catch any accidental JSX/syntax break), not a new component test.

- [ ] **Step 1: Replace the final `return` block**

In `apps/web/app/(portal)/parent/attendance/page.tsx`, the component `ParentAttendancePage` has this exact sequence before its final `return`: the `today`/`view` state, `useSelectedChild()`, `useCurrentAcademicYear()`, `monthInfo`, the `useStudentAttendanceSummary`/`useStudentAttendanceHistory` calls, `historyMap`/`monthCounts`/`cells` memos, `goToMonth`/`goToToday`, `isCurrentMonth`/`monthLabel`, the `header` const, and four early-return guard blocks (`childrenLoading`, `childrenError`, `children.length === 0`, `!selectedChildId || !selectedChild`) — **none of this changes**. Only the final `return (...)` (currently the block starting with `const childName = ...` through the closing `);` and `}` of the component) changes.

Replace from `const childName = ...` through the end of the file with:

```tsx
  const childName = `${selectedChild.firstName} ${selectedChild.lastName}`;
  const showSummarySkeleton = yearLoading || summaryLoading;

  return (
    <div className="space-y-5">
      {header}

      {/* Year-to-date stat card — sourced directly from the backend's official
          figure, never client-recomputed. Stays full-width and first: the
          headline number deserves top billing regardless of viewport. */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
        {summaryError ? (
          <QueryErrorState onRetry={() => refetchSummary()} message="Couldn't load this child's attendance summary." />
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-500/[0.12]">
                <CalendarCheck2 className="h-7 w-7 text-brand-600 dark:text-brand-400" />
              </div>
              <div>
                <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                  Year-to-date attendance
                  {currentYear?.name ? ` · ${currentYear.name}` : ''}
                </p>
                {showSummarySkeleton ? (
                  <Skeleton className="mt-1 h-9 w-24" />
                ) : (
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {summary ? `${summary.attendancePercent}%` : '—'}
                  </p>
                )}
              </div>
            </div>
            {!showSummarySkeleton && summary && (
              <div className="grid grid-cols-4 gap-3">
                <CountTile
                  label="Present"
                  value={summary.present}
                  textClass="text-success-700 dark:text-success-400"
                  isLoading={false}
                />
                <CountTile
                  label="Absent"
                  value={summary.absent}
                  textClass="text-error-700 dark:text-error-400"
                  isLoading={false}
                />
                <CountTile
                  label="Late"
                  value={summary.late}
                  textClass="text-warning-700 dark:text-warning-400"
                  isLoading={false}
                />
                <CountTile
                  label="Leave"
                  value={summary.leave}
                  textClass="text-brand-700 dark:text-brand-400"
                  isLoading={false}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* WEB-P UI/UX pass (2026-07-24, see docs/superpowers/specs/2026-07-24-
          portal-shell-sidebar-design.md §5.1): the calendar + its month nav
          live in a width-capped left column so day cells never scale with
          the full page width; the freed space on wide screens holds the
          monthly summary + leave form instead of sitting empty. Stacks to
          one column below xl:. */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,560px)_1fr] xl:items-start">
        <div className="mx-auto w-full max-w-[560px] space-y-5 xl:mx-0">
          {/* Month nav */}
          <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon-sm" onClick={() => goToMonth(-1)} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <p className="w-40 text-center text-base font-semibold text-gray-900 dark:text-white sm:w-48 sm:text-lg">
                {monthLabel}
              </p>
              <Button variant="outline" size="icon-sm" onClick={() => goToMonth(1)} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={goToToday} disabled={isCurrentMonth}>
              Today
            </Button>
          </div>

          {/* Calendar grid */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
            {historyError ? (
              <QueryErrorState onRetry={() => refetchHistory()} message="Couldn't load this month's attendance." />
            ) : (
              <>
                <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                  {DAY_HEADERS.map((label, i) => (
                    <div
                      key={label}
                      className={cn(
                        'py-1 text-center text-xs font-semibold uppercase tracking-wide',
                        i === 6 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500',
                      )}
                    >
                      {label}
                    </div>
                  ))}
                </div>

                <div className="mt-1 grid grid-cols-7 gap-1.5 sm:gap-2">
                  {historyLoading
                    ? Array.from({ length: 35 }).map((_, i) => (
                        <Skeleton key={i} className="aspect-square w-full rounded-lg" />
                      ))
                    : cells.map((cell, idx) => {
                        if (!cell) return <div key={`blank-${idx}`} aria-hidden />;
                        const status = historyMap.get(cell.dateAd);
                        const style = status && status in STATUS_CELL_STYLES ? STATUS_CELL_STYLES[status as StatusKey] : undefined;
                        return (
                          <div
                            key={cell.dateAd}
                            title={cell.dateAd}
                            className={cn(
                              'flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-lg text-sm font-semibold',
                              style
                                ? cn(style.bg, style.text)
                                : cell.isSaturday
                                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/[0.08] dark:text-amber-400'
                                  : 'bg-gray-50 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400',
                              cell.isToday && 'ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-gray-900',
                            )}
                          >
                            <span>{cell.day}</span>
                            {style && <span className={cn('h-1 w-1 rounded-full', style.dot)} />}
                          </div>
                        );
                      })}
                </div>

                {/* Legend */}
                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-gray-100 pt-4 dark:border-gray-800">
                  {LEGEND_ITEMS.map(({ status, label }) => (
                    <div key={status} className="flex items-center gap-1.5">
                      <span className={cn('h-2.5 w-2.5 rounded-full', STATUS_CELL_STYLES[status].dot)} />
                      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400 dark:bg-amber-500/70" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">Saturday (non-school day)</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="space-y-5">
          {/* Raw-counts summary strip for the visible month — plain tallies from
              the fetched day rows, no percentage claim here (see design-decision
              note above). */}
          {!historyError && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
              <p className="mb-3 text-theme-sm font-medium text-gray-700 dark:text-gray-300">{monthLabel} summary</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CountTile
                  label="Present"
                  value={monthCounts.PRESENT}
                  textClass="text-success-700 dark:text-success-400"
                  isLoading={historyLoading}
                />
                <CountTile
                  label="Absent"
                  value={monthCounts.ABSENT}
                  textClass="text-error-700 dark:text-error-400"
                  isLoading={historyLoading}
                />
                <CountTile
                  label="Late"
                  value={monthCounts.LATE}
                  textClass="text-warning-700 dark:text-warning-400"
                  isLoading={historyLoading}
                />
                <CountTile
                  label="Leave"
                  value={monthCounts.LEAVE}
                  textClass="text-brand-700 dark:text-brand-400"
                  isLoading={historyLoading}
                />
              </div>
            </div>
          )}

          {/* Leave request — `key` forces a remount (and form reset) whenever the
              selected child changes, so a partially-typed request for one child
              never bleeds into another child's form. */}
          <LeaveRequestForm
            key={selectedChildId}
            studentId={selectedChildId}
            studentName={childName}
            academicYearId={academicYearId}
            academicYearReady={!yearLoading && !!academicYearId}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run tsc to confirm no type errors**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean, no output.

- [ ] **Step 3: Run the full suite to confirm no regressions**

Run: `cd apps/web && npx vitest run`
Expected: PASS — 334 tests, 21 test files (unchanged from Task 5 — no new tests, no tests reference this page's markup directly).

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(portal)/parent/attendance/page.tsx"
git commit -m "fix(web): cap parent attendance calendar width, stop wasting space

Calendar + month nav move into a max-w-[560px] column so day cells stop
scaling with the full page width. At xl: breakpoints the freed space
holds the monthly summary strip + leave-request form side-by-side
instead of sitting empty below a full-bleed calendar."
```

---

### Task 7: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean, no output.

- [ ] **Step 2: Full test suite**

Run: `cd apps/web && npx vitest run`
Expected: PASS — 334 tests, 21 test files (320 baseline + 14 new: 2 SidebarBackdrop + 5 PortalSidebar + 3 PortalHeader + 2 PortalShell + 2 ChildSwitcher).

- [ ] **Step 3: Manual nav-item parity check**

For each of `TEACHER_NAV_ITEMS`, `STUDENT_NAV_ITEMS`, `PARENT_NAV_ITEMS` in `apps/web/components/layout/portal-sidebar.tsx`, diff the `href`/`label` pairs against the arrays that existed in `portal-shell.tsx` before Task 4 (8 teacher items, 6 student items, 7 parent items) — confirm the move introduced no accidental addition, removal, or href typo. This is the regression surface Task 2's active-link test doesn't fully cover (it checks labels render and one active/inactive pair, not an exhaustive href diff).

- [ ] **Step 4: Manual async-gate + `useSelectedChild` self-heal re-check**

Per the design spec §6/§7: `ChildSwitcher` (Task 5) and the parent attendance page (Task 6) are the two files this pass directly edited that sit downstream of `useSelectedChild()`'s self-healing effect (WEB-P Phase 5 whole-branch-review fix, commit `0bd15fb`) and the project's recurring async-gate guard pattern. Re-read `apps/web/lib/hooks/use-selected-child.ts` and confirm neither Task 5 nor Task 6's edits touched anything upstream of `selectedChildId`/`isLoading` — both tasks only changed JSX/className, never a hook call, guard condition, or the `key={selectedChildId}` remount prop on `LeaveRequestForm`. Confirm by reading the final `apps/web/app/(portal)/parent/attendance/page.tsx` and checking the four early-return guards (`childrenLoading`, `childrenError`, `children.length === 0`, `!selectedChildId || !selectedChild`) are byte-identical to the pre-Task-6 version.

- [ ] **Step 5: Confirm scope boundaries held**

This branch (`feat/web-p-phase-5-parent`) already contains all of WEB-P Phases 0.5–5 unmerged, so diffing against `main` would show that entire history, not just this plan's changes. Diff against this plan's actual starting point instead — the design-spec-only commit made before Task 1 began:

Run: `git diff --stat 364749d..HEAD`
Expected: only these files (plus their new `__tests__` files) appear: `apps/web/components/layout/sidebar-backdrop.tsx`, `apps/web/components/layout/portal-sidebar.tsx`, `apps/web/components/layout/portal-header.tsx`, `apps/web/components/layout/portal-shell.tsx`, `apps/web/components/layout/school-shell.tsx`, `apps/web/components/parent/child-switcher.tsx`, `apps/web/app/(portal)/parent/attendance/page.tsx`. No file under `apps/api/`, no student/teacher screen file, no hook/API-client file.

---

## Self-Review Notes

**Spec coverage:** §3 (sidebar architecture) → Tasks 1–2. §4.1–4.3 (`PortalSidebar`, `Backdrop` extraction, `PortalShell` restructure) → Tasks 1, 2, 4. §4.4 (`PortalHeader`, `ROLE_LABELS` invariant) → Task 3. §4.5 (`ChildSwitcher`) → Task 5. §5.1 (calendar cap + two-column layout) → Task 6. §5.2 (remaining 6 parent screens) → explicitly out of scope for this plan per the locked design scope, not silently dropped. §6 (preserved invariants) → Task 7 Steps 3–4. §7 (verification) → Task 7. §8 (non-goals) → Global Constraints.

**Placeholder scan:** no TBD/TODO markers; every step has complete code, not a description of code.

**Type consistency:** `PortalNavItem` (Task 2) is defined once and only consumed inside `portal-sidebar.tsx` itself — `PortalShell` (Task 4) no longer imports the nav arrays at all, since nav rendering moved entirely into `PortalSidebar`. `ROLE_LABELS` (Task 3, `portal-header.tsx`) and the nav-item exports (Task 2, `portal-sidebar.tsx`) are two separate, non-conflicting local constants in their own files — neither is imported by the other. `homeRoute`/`canAccess` signatures used in Tasks 2 and 4 match the existing `apps/web/lib/route-access.ts` exports verified at plan-writing time (no signature invented).
