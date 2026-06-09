# SuperAdmin Panel — Complete Redesign Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-step. Each task is self-contained and produces working output.

**Goal:** Fix all broken UI interactions in the SuperAdmin panel, add missing features (Revenue Analytics, Platform Settings), and upgrade the layout to match TailAdmin Pro styling with collapsible sidebar, full header, and polished UX.

**Architecture:** Replace the inline superadmin layout with proper shell components (`SuperAdminShell`, `SuperAdminSidebar`, `SuperAdminHeader`) that mirror the school portal's `SchoolShell`/`Sidebar`/`Header` pattern. Fix all Select components to use the async-data computed-span pattern. Add two new pages (Revenue, Settings). Fix API response parsing and form validation across all pages.

**Tech Stack:** Next.js 14 App Router, @base-ui/react (Select, Dialog, Menu), TanStack Query v5, Zustand v5, React Hook Form + Zod, Tailwind CSS v4, lucide-react icons

---

## Task 1: Create SuperAdminShell Layout Component

**Files:**
- Create: `apps/web/components/layout/super-admin-shell.tsx`

This replaces the inline layout in `superadmin/layout.tsx` with a proper shell that includes collapsible sidebar, header, and content area.

- [ ] **Step 1: Create the SuperAdminShell component**

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useSidebar } from '@/context/sidebar-context';
import { SuperAdminSidebar } from './super-admin-sidebar';
import { SuperAdminHeader } from './super-admin-header';
import { cn } from '@/lib/utils';

export function SuperAdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, accessToken, isInitialized, logout } = useAuthStore();
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();

  const isLoginPage = pathname === '/super-admin/login';

  useEffect(() => {
    if (isLoginPage) return;
    if (!isInitialized) return;
    if (!accessToken || user?.role !== 'PLATFORM_ADMIN') {
      router.replace('/super-admin/login');
    }
  }, [isInitialized, accessToken, user, router, isLoginPage]);

  if (isLoginPage) return <>{children}</>;

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Loader2 className="h-6 w-6 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (!accessToken || user?.role !== 'PLATFORM_ADMIN') return null;

  const mainMargin = isMobileOpen
    ? 'ml-0'
    : isExpanded || isHovered
      ? 'lg:ml-[260px]'
      : 'lg:ml-[70px]';

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      <SuperAdminSidebar />
      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-900/50 lg:hidden"
          onClick={() => useSidebar().toggleMobileSidebar()}
        />
      )}
      <div
        className={cn(
          'relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden transition-all duration-300 ease-in-out',
          mainMargin,
        )}
      >
        <SuperAdminHeader />
        <main className="flex-1 p-4 md:p-6 2xl:p-10">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors related to missing imports (sidebar/header not yet created — will resolve in next tasks)

---

## Task 2: Create SuperAdminSidebar Component

**Files:**
- Create: `apps/web/components/layout/super-admin-sidebar.tsx`

Collapsible dark sidebar with navigation groups, matching TailAdmin Pro styling.

- [ ] **Step 1: Create the SuperAdminSidebar component**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  School,
  CreditCard,
  TrendingUp,
  ClipboardList,
  Settings,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { useSidebar } from '@/context/sidebar-context';
import { useAuthStore } from '@/store/auth.store';
import { superAdminApi } from '@/lib/api/super-admin.api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useState } from 'react';

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/super-admin/dashboard', icon: LayoutDashboard },
      { label: 'Revenue', href: '/super-admin/revenue', icon: TrendingUp },
    ],
  },
  {
    title: 'Management',
    items: [
      { label: 'Schools', href: '/super-admin/schools', icon: School },
      { label: 'Plans', href: '/super-admin/plans', icon: CreditCard },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Audit Log', href: '/super-admin/audit', icon: ClipboardList },
      { label: 'Settings', href: '/super-admin/settings', icon: Settings },
    ],
  },
];

export function SuperAdminSidebar() {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered, toggleMobileSidebar } = useSidebar();
  const pathname = usePathname();
  const { logout } = useAuthStore();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Overview: true,
    Management: true,
    System: true,
  });

  const showLabels = isExpanded || isHovered || isMobileOpen;

  function toggleGroup(title: string) {
    setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }));
  }

  async function handleLogout() {
    try {
      await superAdminApi.logout();
    } catch { /* ignore */ }
    logout();
    toast.success('Logged out');
    window.location.href = '/super-admin/login';
  }

  return (
    <aside
      className={cn(
        'fixed top-0 left-0 z-50 flex h-screen flex-col bg-gray-900 transition-all duration-300 ease-in-out',
        showLabels ? 'w-[260px]' : 'w-[70px]',
        isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Logo */}
      <div className={cn('flex items-center gap-3 px-5 py-5 border-b border-white/[0.08]', !showLabels && 'lg:justify-center lg:px-0')}>
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-500">
          <span className="text-sm font-bold text-white">AS</span>
        </div>
        {showLabels && (
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Aaramva Shikshya</p>
            <p className="text-sm font-bold text-white truncate">Platform Admin</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 no-scrollbar">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-4">
            {showLabels && (
              <button
                onClick={() => toggleGroup(group.title)}
                className="flex w-full items-center justify-between px-3 mb-2 text-[10px] font-semibold text-gray-500 uppercase tracking-widest hover:text-gray-400 transition-colors"
              >
                <span>{group.title}</span>
                <ChevronDown
                  className={cn(
                    'h-3 w-3 transition-transform duration-200',
                    openGroups[group.title] ? 'rotate-0' : '-rotate-90',
                  )}
                />
              </button>
            )}
            {(!showLabels || openGroups[group.title]) && (
              <ul className="space-y-0.5">
                {group.items.map(({ label, href, icon: Icon }) => {
                  const active = pathname === href || (href !== '/super-admin/dashboard' && pathname.startsWith(href));
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={() => { if (isMobileOpen) toggleMobileSidebar(); }}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                          active
                            ? 'bg-brand-500/10 text-brand-400'
                            : 'text-gray-400 hover:bg-white/[0.06] hover:text-gray-200',
                          !showLabels && 'lg:justify-center lg:px-0',
                        )}
                        title={!showLabels ? label : undefined}
                      >
                        <Icon className="h-5 w-5 flex-shrink-0" />
                        {showLabels && <span>{label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-white/[0.08]">
        <button
          onClick={handleLogout}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-400 hover:bg-white/[0.06] hover:text-gray-200 transition-colors',
            !showLabels && 'lg:justify-center lg:px-0',
          )}
          title={!showLabels ? 'Logout' : undefined}
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {showLabels && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

---

## Task 3: Create SuperAdminHeader Component

**Files:**
- Create: `apps/web/components/layout/super-admin-header.tsx`

Full header with sidebar toggle, search bar, theme toggle, and user menu dropdown.

- [ ] **Step 1: Create the SuperAdminHeader component**

```tsx
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useSidebar } from '@/context/sidebar-context';
import { useAuthStore } from '@/store/auth.store';
import { superAdminApi } from '@/lib/api/super-admin.api';
import { Search } from 'lucide-react';

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="relative flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full hover:text-gray-700 h-10 w-10 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
      aria-label="Toggle theme"
    >
      <svg className="hidden dark:block" width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" clipRule="evenodd" d="M9.99998 1.5415C10.4142 1.5415 10.75 1.87729 10.75 2.2915V3.5415C10.75 3.95572 10.4142 4.2915 9.99998 4.2915C9.58577 4.2915 9.24998 3.95572 9.24998 3.5415V2.2915C9.24998 1.87729 9.58577 1.5415 9.99998 1.5415ZM10.0009 6.79327C8.22978 6.79327 6.79402 8.22904 6.79402 10.0001C6.79402 11.7712 8.22978 13.207 10.0009 13.207C11.772 13.207 13.2078 11.7712 13.2078 10.0001C13.2078 8.22904 11.772 6.79327 10.0009 6.79327ZM5.29402 10.0001C5.29402 7.40061 7.40135 5.29327 10.0009 5.29327C12.6004 5.29327 14.7078 7.40061 14.7078 10.0001C14.7078 12.5997 12.6004 14.707 10.0009 14.707C7.40135 14.707 5.29402 12.5997 5.29402 10.0001ZM15.9813 5.08035C16.2742 4.78746 16.2742 4.31258 15.9813 4.01969C15.6884 3.7268 15.2135 3.7268 14.9207 4.01969L14.0368 4.90357C13.7439 5.19647 13.7439 5.67134 14.0368 5.96423C14.3297 6.25713 14.8045 6.25713 15.0974 5.96423L15.9813 5.08035ZM18.4577 10.0001C18.4577 10.4143 18.1219 10.7501 17.7077 10.7501H16.4577C16.0435 10.7501 15.7077 10.4143 15.7077 10.0001C15.7077 9.58592 16.0435 9.25013 16.4577 9.25013H17.7077C18.1219 9.25013 18.4577 9.58592 18.4577 10.0001ZM9.99998 15.7088C10.4142 15.7088 10.75 16.0445 10.75 16.4588V17.7088C10.75 18.123 10.4142 18.4588 9.99998 18.4588C9.58577 18.4588 9.24998 18.123 9.24998 17.7088V16.4588C9.24998 16.0445 9.58577 15.7088 9.99998 15.7088Z" fill="currentColor" />
      </svg>
      <svg className="dark:hidden" width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M17.4547 11.97L18.1799 12.1611C18.265 11.8383 18.1265 11.4982 17.8401 11.3266C17.5538 11.1551 17.1885 11.1934 16.944 11.4207L17.4547 11.97ZM8.0306 2.5459L8.57989 3.05657C8.80718 2.81209 8.84554 2.44682 8.67398 2.16046C8.50243 1.8741 8.16227 1.73559 7.83948 1.82066L8.0306 2.5459ZM12.9154 13.0035C9.64678 13.0035 6.99707 10.3538 6.99707 7.08524H5.49707C5.49707 11.1823 8.81835 14.5035 12.9154 14.5035V13.0035ZM16.944 11.4207C15.8869 12.4035 14.4721 13.0035 12.9154 13.0035V14.5035C14.8657 14.5035 16.6418 13.7499 17.9654 12.5193L16.944 11.4207ZM16.7295 11.7789C15.9437 14.7607 13.2277 16.9586 10.0003 16.9586V18.4586C13.9257 18.4586 17.2249 15.7853 18.1799 12.1611L16.7295 11.7789ZM10.0003 16.9586C6.15734 16.9586 3.04199 13.8433 3.04199 10.0003H1.54199C1.54199 14.6717 5.32892 18.4586 10.0003 18.4586V16.9586ZM3.04199 10.0003C3.04199 6.77289 5.23988 4.05695 8.22173 3.27114L7.83948 1.82066C4.21532 2.77574 1.54199 6.07486 1.54199 10.0003H3.04199ZM6.99707 7.08524C6.99707 5.52854 7.5971 4.11366 8.57989 3.05657L7.48132 2.03522C6.25073 3.35885 5.49707 5.13487 5.49707 7.08524H6.99707Z" fill="currentColor" />
      </svg>
    </button>
  );
}

function UserMenu() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
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
    : 'Admin';

  const initials = user
    ? user.firstName && user.lastName
      ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
      : user.email.slice(0, 2).toUpperCase()
    : 'PA';

  async function handleLogout() {
    try { await superAdminApi.logout(); } catch { /* ignore */ }
    logout();
    router.push('/super-admin/login');
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen((p) => !p); }}
        className="flex items-center gap-2 text-gray-700 dark:text-gray-400"
      >
        <span className="flex items-center justify-center h-10 w-10 rounded-full bg-brand-500 text-white text-sm font-semibold">
          {initials}
        </span>
        <span className="hidden md:block text-theme-sm font-medium max-w-[140px] truncate">{displayName}</span>
        <svg
          className={`stroke-gray-500 dark:stroke-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          width="16" height="16" viewBox="0 0 18 20" fill="none" xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M4.3125 8.65625L9 13.3437L13.6875 8.65625" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-4 w-60 flex flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900 z-[9999]">
          <div className="mb-3">
            <span className="block font-medium text-gray-700 text-theme-sm dark:text-gray-300">
              {displayName}
            </span>
            <span className="block text-theme-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Platform Admin
            </span>
          </div>
          <div className="border-t border-gray-200 dark:border-gray-800 pt-3">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-2 font-medium text-gray-700 rounded-lg text-theme-sm hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300 transition-colors"
            >
              <svg className="fill-gray-500 dark:fill-gray-400" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" clipRule="evenodd" d="M15.1007 19.247C14.6865 19.247 14.3507 18.9112 14.3507 18.497L14.3507 14.245H12.8507V18.497C12.8507 19.7396 13.8581 20.747 15.1007 20.747H18.5007C19.7434 20.747 20.7507 19.7396 20.7507 18.497L20.7507 5.49609C20.7507 4.25345 19.7433 3.24609 18.5007 3.24609H15.1007C13.8581 3.24609 12.8507 4.25345 12.8507 5.49609V9.74501L14.3507 9.74501V5.49609C14.3507 5.08188 14.6865 4.74609 15.1007 4.74609L18.5007 4.74609C18.9149 4.74609 19.2507 5.08188 19.2507 5.49609L19.2507 18.497C19.2507 18.9112 18.9149 19.247 18.5007 19.247H15.1007ZM3.25073 11.9984C3.25073 12.2144 3.34204 12.4091 3.48817 12.546L8.09483 17.1556C8.38763 17.4485 8.86251 17.4487 9.15549 17.1559C9.44848 16.8631 9.44863 16.3882 9.15583 16.0952L5.81116 12.7484L16.0007 12.7484C16.4149 12.7484 16.7507 12.4127 16.7507 11.9984C16.7507 11.5842 16.4149 11.2484 16.0007 11.2484L5.81528 11.2484L9.15585 7.90554C9.44864 7.61255 9.44847 7.13767 9.15547 6.84488C8.86248 6.55209 8.3876 6.55226 8.09481 6.84525L3.52309 11.4202C3.35673 11.5577 3.25073 11.7657 3.25073 11.9984Z" fill="" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SuperAdminHeader() {
  const { isMobileOpen, isExpanded, isHovered, toggleSidebar, toggleMobileSidebar } = useSidebar();
  const searchRef = useRef<HTMLInputElement>(null);

  const handleToggle = () => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      toggleSidebar();
    } else {
      toggleMobileSidebar();
    }
  };

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header className="sticky top-0 flex w-full bg-white border-gray-200 z-[999] dark:border-gray-800 dark:bg-gray-900 lg:border-b">
      <div className="flex flex-col items-center justify-between grow lg:flex-row lg:px-6">
        <div className="flex items-center justify-between w-full gap-2 px-3 py-3 border-b border-gray-200 dark:border-gray-800 sm:gap-4 lg:justify-normal lg:border-b-0 lg:px-0 lg:py-4">
          <button
            onClick={handleToggle}
            className="items-center justify-center w-10 h-10 text-gray-500 border border-gray-200 rounded-lg dark:border-gray-800 lg:flex dark:text-gray-400 lg:h-11 lg:w-11 lg:border hover:bg-gray-100 dark:hover:bg-gray-800"
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
          <div className="flex items-center gap-2 2xsm:gap-3">
            <div className="hidden lg:block">
              <form>
                <div className="relative">
                  <span className="absolute -translate-y-1/2 left-4 top-1/2 pointer-events-none">
                    <Search className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  </span>
                  <input
                    ref={searchRef}
                    type="text"
                    placeholder="Search or type command..."
                    className="dark:bg-dark-900 h-11 w-full rounded-lg border border-gray-200 bg-transparent py-2.5 pl-12 pr-14 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:bg-white/[0.03] dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 xl:w-[430px]"
                  />
                  <button type="button" className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-[7px] py-[4.5px] text-xs -tracking-[0.2px] text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
                    <span> ⌘ </span>
                    <span> K </span>
                  </button>
                </div>
              </form>
            </div>
            <ThemeToggle />
          </div>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

---

## Task 4: Update SuperAdmin Layout to Use New Shell

**Files:**
- Modify: `apps/web/app/super-admin/layout.tsx`

Replace the inline layout with the new `SuperAdminShell` component.

- [ ] **Step 1: Replace layout.tsx content**

```tsx
import { SuperAdminShell } from '@/components/layout/super-admin-shell';

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <SuperAdminShell>{children}</SuperAdminShell>;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

---

## Task 5: Add Revenue API Hook and Types

**Files:**
- Modify: `apps/web/lib/api/super-admin.api.ts` — add `getRevenue` call
- Modify: `apps/web/types/api.types.ts` — add `RevenueData` type
- Create: `apps/web/lib/hooks/use-revenue.ts`

- [ ] **Step 1: Add RevenueData type to api.types.ts**

Add after the `CreatePlanData` interface:

```typescript
export interface RevenueData {
  month: string;
  planName: string;
  activeSchools: number;
  revenue: number;
}
```

- [ ] **Step 2: Add getRevenue to super-admin.api.ts**

Add to the `superAdminApi` object:

```typescript
// Analytics
getRevenue: () =>
  api.get<ApiResponse<RevenueData[]>>('/super-admin/analytics/revenue'),
```

- [ ] **Step 3: Create use-revenue.ts hook**

```typescript
import { useQuery } from '@tanstack/react-query';
import { superAdminApi } from '@/lib/api/super-admin.api';

export function useRevenue() {
  return useQuery({
    queryKey: ['platform', 'revenue'],
    queryFn: () => superAdminApi.getRevenue().then((r) => r.data.data),
  });
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

---

## Task 6: Create Revenue Analytics Page

**Files:**
- Create: `apps/web/app/super-admin/revenue/page.tsx`

- [ ] **Step 1: Create the Revenue page**

```tsx
'use client';

import { useMemo } from 'react';
import { TrendingUp, DollarSign, School, Calendar } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { useRevenue } from '@/lib/hooks/use-revenue';

function StatCard({
  title,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  subtitle,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${iconBg}`}>
          <Icon className={`h-6 w-6 ${iconColor}`} />
        </div>
        <div>
          <p className="text-theme-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          {subtitle && <p className="text-theme-xs text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

export default function RevenuePage() {
  const { data: revenue, isLoading } = useRevenue();

  const stats = useMemo(() => {
    if (!revenue || revenue.length === 0) {
      return { totalRevenue: 0, totalSchools: 0, thisMonth: 0, lastMonth: 0, byPlan: {} as Record<string, number> };
    }

    const totalRevenue = revenue.reduce((sum, r) => sum + r.revenue, 0);
    const totalSchools = revenue.reduce((sum, r) => sum + r.activeSchools, 0);

    // Group by month
    const byMonth: Record<string, number> = {};
    for (const r of revenue) {
      byMonth[r.month] = (byMonth[r.month] ?? 0) + r.revenue;
    }
    const months = Object.keys(byMonth).sort().reverse();
    const thisMonth = months.length > 0 ? byMonth[months[0]] : 0;
    const lastMonth = months.length > 1 ? byMonth[months[1]] : 0;

    // Group by plan
    const byPlan: Record<string, number> = {};
    for (const r of revenue) {
      byPlan[r.planName] = (byPlan[r.planName] ?? 0) + r.revenue;
    }

    return { totalRevenue, totalSchools, thisMonth, lastMonth, byPlan };
  }, [revenue]);

  // Chart data: last 12 months
  const chartData = useMemo(() => {
    if (!revenue) return [];
    const byMonth: Record<string, number> = {};
    for (const r of revenue) {
      byMonth[r.month] = (byMonth[r.month] ?? 0) + r.revenue;
    }
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, rev]) => ({ month, revenue: rev }));
  }, [revenue]);

  const maxRevenue = chartData.length > 0 ? Math.max(...chartData.map((d) => d.revenue)) : 1;

  return (
    <div>
      <PageHeader title="Revenue Analytics" description="Platform revenue breakdown by month and plan" />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Revenue"
          value={isLoading ? '—' : `Rs. ${stats.totalRevenue.toLocaleString()}`}
          icon={DollarSign}
          iconBg="bg-brand-50 dark:bg-brand-500/[0.12]"
          iconColor="text-brand-500 dark:text-brand-400"
          subtitle="All time"
        />
        <StatCard
          title="This Month"
          value={isLoading ? '—' : `Rs. ${stats.thisMonth.toLocaleString()}`}
          icon={TrendingUp}
          iconBg="bg-success-50 dark:bg-success-500/[0.12]"
          iconColor="text-success-500 dark:text-success-400"
          subtitle={stats.lastMonth > 0 ? `${(((stats.thisMonth - stats.lastMonth) / stats.lastMonth) * 100).toFixed(1)}% vs last month` : undefined}
        />
        <StatCard
          title="Active Subscriptions"
          value={isLoading ? '—' : String(stats.totalSchools)}
          icon={School}
          iconBg="bg-warning-50 dark:bg-warning-500/[0.12]"
          iconColor="text-warning-500 dark:text-warning-400"
          subtitle="Paying schools"
        />
        <StatCard
          title="Plans Generating Revenue"
          value={isLoading ? '—' : String(Object.keys(stats.byPlan).length)}
          icon={Calendar}
          iconBg="bg-purple-50 dark:bg-purple-500/[0.12]"
          iconColor="text-purple-500 dark:text-purple-400"
        />
      </div>

      {/* Revenue bar chart */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-gray-900 p-5 mb-6">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-4">Monthly Revenue</h3>
        {isLoading ? (
          <div className="flex items-end gap-2 h-48">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="flex-1" style={{ height: `${30 + Math.random() * 60}%` }} />
            ))}
          </div>
        ) : chartData.length === 0 ? (
          <p className="text-theme-sm text-gray-400 dark:text-gray-500 text-center py-16">No revenue data yet</p>
        ) : (
          <div className="flex items-end gap-2 h-48">
            {chartData.map((d) => (
              <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                  Rs. {(d.revenue / 1000).toFixed(0)}k
                </span>
                <div
                  className="w-full rounded-t-md bg-brand-500 dark:bg-brand-400 transition-all duration-300 min-h-[4px]"
                  style={{ height: `${Math.max((d.revenue / maxRevenue) * 100, 2)}%` }}
                />
                <span className="text-[10px] text-gray-400 dark:text-gray-500">{d.month.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Plan breakdown */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white">Revenue by Plan</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-5 py-3 text-theme-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Plan</th>
                <th className="text-right px-5 py-3 text-theme-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Revenue</th>
                <th className="text-right px-5 py-3 text-theme-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                    {[1, 2, 3].map((j) => (
                      <td key={j} className="px-5 py-3"><Skeleton className="h-4 w-24" /></td>
                    ))}
                  </tr>
                ))
              ) : Object.keys(stats.byPlan).length === 0 ? (
                <tr><td colSpan={3} className="px-5 py-10 text-center text-theme-sm text-gray-400">No data</td></tr>
              ) : (
                Object.entries(stats.byPlan)
                  .sort(([, a], [, b]) => b - a)
                  .map(([plan, rev]) => (
                    <tr key={plan} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                      <td className="px-5 py-3 font-medium text-gray-800 dark:text-white capitalize">{plan}</td>
                      <td className="px-5 py-3 text-right text-gray-600 dark:text-gray-300">Rs. {rev.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right text-gray-500 dark:text-gray-400">
                        {stats.totalRevenue > 0 ? ((rev / stats.totalRevenue) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

---

## Task 7: Fix Schools Page — Select Components and Form Validation

**Files:**
- Modify: `apps/web/app/super-admin/schools/page.tsx`

This is the biggest fix. The Select components for plan filter, status filter, and onboard form plan select all need the computed-span pattern. The onboard form needs Zod validation.

- [ ] **Step 1: Rewrite schools/page.tsx with fixes**

Key changes:
1. Import `useForm` and `zodResolver`, use `onboardTenantSchema` for the onboard form
2. Replace all `<SelectValue>` with computed `<span>` pattern
3. Fix pagination meta extraction: `tenantsData?.data` for array, `tenantsData?.meta` for meta
4. Fix impersonation: `impersonate.mutateAsync(tenant.id)` returns `{ data: { data: ImpersonationToken } }`, so `const res = await ...; const token = res.data.data`

```tsx
'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Search, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  useTenants,
  usePlans,
  useOnboardTenant,
  useSuspendTenant,
  useActivateTenant,
  useImpersonate,
} from '@/lib/hooks/use-super-admin';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';
import { onboardTenantSchema, type OnboardTenantValues } from '@/lib/schemas/super-admin.schema';
import type { TenantSummary } from '@/types/api.types';

const suggestSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);

export default function SchoolsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: plans } = usePlans();
  const { data: tenantsData, isLoading } = useTenants({
    page,
    limit: 20,
    search: search || undefined,
    status: (statusFilter as 'active' | 'suspended') || undefined,
    planId: planFilter || undefined,
  });
  const onboardTenant = useOnboardTenant();
  const suspendTenant = useSuspendTenant();
  const activateTenant = useActivateTenant();
  const impersonate = useImpersonate();
  const { setAuth } = useAuthStore();
  const { setTenant } = useTenantStore();

  // Zod-validated form
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<OnboardTenantValues>({
    resolver: zodResolver(onboardTenantSchema),
    defaultValues: {
      schoolName: '',
      slug: '',
      planId: '',
      adminEmail: '',
      adminFirstName: '',
      adminLastName: '',
      adminPassword: '',
      phone: '',
      address: '',
      panNumber: '',
      trialDays: 30,
    },
  });

  const watchedPlanId = watch('planId');
  const selectedPlan = plans?.find((p) => p.id === watchedPlanId);
  const isTrial = selectedPlan?.name?.toLowerCase() === 'trial';

  const tenants = tenantsData?.data ?? [];
  const meta = tenantsData?.meta;

  function handleSearchChange(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 400);
  }

  async function onSubmitForm(data: OnboardTenantValues) {
    try {
      await onboardTenant.mutateAsync({
        schoolName: data.schoolName,
        slug: data.slug,
        planId: data.planId,
        adminEmail: data.adminEmail,
        adminFirstName: data.adminFirstName,
        adminLastName: data.adminLastName,
        adminPassword: data.adminPassword,
        phone: data.phone || undefined,
        address: data.address || undefined,
        panNumber: data.panNumber || undefined,
        trialDays: data.trialDays,
      });
      toast.success('School onboarded successfully');
      setAddOpen(false);
      reset();
    } catch {
      toast.error('Failed to onboard school');
    }
  }

  async function handleImpersonate(tenant: TenantSummary) {
    try {
      const res = await impersonate.mutateAsync(tenant.id);
      const token = res.data.data;
      setAuth(token.accessToken, {
        id: '',
        email: '',
        role: 'SCHOOL_OWNER',
        tenantId: null,
        tenantSlug: token.tenantSlug,
      });
      setTenant({ slug: token.tenantSlug, name: token.schoolName });
      toast.warning('Impersonation active — all actions are audited', { duration: 6000 });
      window.open(`/?tenant=${token.tenantSlug}`, '_blank');
    } catch {
      toast.error('Impersonation failed');
    }
  }

  const columns: ColumnDef<TenantSummary>[] = [
    {
      id: 'name',
      header: 'School',
      cell: ({ row }) => (
        <Link
          href={`/super-admin/schools/${row.original.id}`}
          className="font-medium text-gray-800 dark:text-white hover:text-brand-500 dark:hover:text-brand-400 hover:underline"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: 'slug',
      header: 'Slug',
      cell: ({ getValue }) => (
        <span className="font-mono text-theme-xs text-gray-500 dark:text-gray-400">
          {getValue<string>()}
        </span>
      ),
    },
    {
      accessorKey: 'planName',
      header: 'Plan',
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusBadge status={row.original.isActive ? 'ACTIVE' : 'SUSPENDED'} />
      ),
    },
    {
      accessorKey: 'studentCount',
      header: 'Students',
      cell: ({ getValue }) => (
        <span className="text-gray-600 dark:text-gray-300">{getValue<number>()}</span>
      ),
    },
    {
      accessorKey: 'staffCount',
      header: 'Staff',
      cell: ({ getValue }) => (
        <span className="text-gray-600 dark:text-gray-300">{getValue<number>()}</span>
      ),
    },
    {
      id: 'joined',
      header: 'Joined',
      cell: ({ row }) => (
        <span className="text-theme-xs text-gray-500 dark:text-gray-400">
          {new Date(row.original.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const t = row.original;
        return (
          <div className="flex items-center gap-1">
            <Link href={`/super-admin/schools/${t.id}`}>
              <Button variant="ghost" size="sm" className="text-xs h-7 px-2">View</Button>
            </Link>
            {t.isActive ? (
              <ConfirmDialog
                title="Suspend School"
                description={`Suspend ${t.name}? They will lose access immediately.`}
                confirmLabel="Suspend"
                variant="destructive"
                trigger={
                  <Button variant="ghost" size="sm" className="text-xs h-7 px-2 text-error-600 hover:text-error-700">
                    Suspend
                  </Button>
                }
                onConfirm={async () => {
                  await suspendTenant.mutateAsync(t.id);
                  toast.success('School suspended');
                }}
              />
            ) : (
              <ConfirmDialog
                title="Activate School"
                description={`Activate ${t.name}?`}
                confirmLabel="Activate"
                trigger={
                  <Button variant="ghost" size="sm" className="text-xs h-7 px-2 text-success-700 hover:text-success-800">
                    Activate
                  </Button>
                }
                onConfirm={async () => {
                  await activateTenant.mutateAsync(t.id);
                  toast.success('School activated');
                }}
              />
            )}
            <ConfirmDialog
              title="Impersonate School Owner"
              description={`You are about to access ${t.name} as SCHOOL_OWNER. All actions will be audited. Continue?`}
              confirmLabel="Impersonate"
              trigger={
                <Button variant="ghost" size="sm" className="text-xs h-7 px-2 text-orange-600 hover:text-orange-700">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Impersonate
                </Button>
              }
              onConfirm={() => handleImpersonate(t)}
            />
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Schools"
        description="Manage all schools on the platform"
        action={
          <Button className="bg-brand-500 hover:bg-brand-600 text-white" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Onboard School
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Search by name or slug..." className="pl-9 w-72" onChange={(e) => handleSearchChange(e.target.value)} />
        </div>
        <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v ?? ''); setPage(1); }}>
          <SelectTrigger className="w-36">
            <span className="truncate">{plans?.find((p) => p.id === planFilter)?.name ?? 'All Plans'}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Plans</SelectItem>
            {plans?.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? ''); setPage(1); }}>
          <SelectTrigger className="w-36">
            <span className="truncate">
              {statusFilter === 'active' ? 'Active' : statusFilter === 'suspended' ? 'Suspended' : 'All Status'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={tenants}
        isLoading={isLoading}
        pagination={meta ? { page, limit: meta.limit, total: meta.total, onPageChange: setPage } : undefined}
      />

      {/* Onboard Dialog */}
      <Dialog open={addOpen} onOpenChange={(open) => { if (!open) { setAddOpen(false); reset(); } }}>
        <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Onboard New School</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmitForm)}>
            <div className="grid grid-cols-2 gap-4 py-2">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="o-name">School Name *</Label>
                <Input
                  id="o-name"
                  {...register('schoolName')}
                  placeholder="St. Xavier's School"
                  onChange={(e) => {
                    register('schoolName').onChange(e);
                    if (!watch('slug') || watch('slug') === suggestSlug(watch('schoolName'))) {
                      setValue('slug', suggestSlug(e.target.value));
                    }
                  }}
                />
                {errors.schoolName && <p className="text-theme-xs text-error-500">{errors.schoolName.message}</p>}
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="o-slug">School Code / Slug *</Label>
                <Input id="o-slug" {...register('slug')} placeholder="sxs" className="font-mono" />
                {errors.slug && <p className="text-theme-xs text-error-500">{errors.slug.message}</p>}
                <p className="text-theme-xs text-gray-400">Only lowercase letters, numbers, hyphens</p>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Plan *</Label>
                <Select
                  value={watchedPlanId || undefined}
                  onValueChange={(v) => setValue('planId', v ?? '')}
                >
                  <SelectTrigger>
                    <span className="truncate">{plans?.find((p) => p.id === watchedPlanId)?.name ?? 'Select a plan'}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {plans?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.planId && <p className="text-theme-xs text-error-500">{errors.planId.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="o-first">Admin First Name *</Label>
                <Input id="o-first" {...register('adminFirstName')} placeholder="Ramesh" />
                {errors.adminFirstName && <p className="text-theme-xs text-error-500">{errors.adminFirstName.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="o-last">Admin Last Name *</Label>
                <Input id="o-last" {...register('adminLastName')} placeholder="Sharma" />
                {errors.adminLastName && <p className="text-theme-xs text-error-500">{errors.adminLastName.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="o-email">Admin Email *</Label>
                <Input id="o-email" type="email" {...register('adminEmail')} placeholder="admin@school.edu.np" />
                {errors.adminEmail && <p className="text-theme-xs text-error-500">{errors.adminEmail.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="o-pass">Admin Password *</Label>
                <Input id="o-pass" type="password" {...register('adminPassword')} placeholder="Min 8 characters" />
                {errors.adminPassword && <p className="text-theme-xs text-error-500">{errors.adminPassword.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="o-phone">Phone</Label>
                <Input id="o-phone" {...register('phone')} placeholder="01-XXXXXXX" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="o-pan">PAN Number</Label>
                <Input id="o-pan" {...register('panNumber')} placeholder="XXXXXXXXX" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="o-address">Address</Label>
                <Input id="o-address" {...register('address')} placeholder="Kathmandu, Nepal" />
              </div>
              {isTrial && (
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="o-trial">Trial Days</Label>
                  <Input id="o-trial" type="number" {...register('trialDays', { valueAsNumber: true })} placeholder="30" min={1} max={90} />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setAddOpen(false); reset(); }}>
                Cancel
              </Button>
              <Button type="submit" className="bg-brand-500 hover:bg-brand-600 text-white" disabled={onboardTenant.isPending}>
                {onboardTenant.isPending ? 'Onboarding…' : 'Onboard School'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

---

## Task 8: Fix School Detail Page — Select and Impersonation

**Files:**
- Modify: `apps/web/app/super-admin/schools/[id]/page.tsx`

Key fixes:
1. Fix plan change Select to use computed-span pattern
2. Fix impersonation token extraction
3. Add edit school dialog

- [ ] **Step 1: Rewrite school detail page with fixes**

```tsx
'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ExternalLink, ArrowLeft, Pencil } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  useTenant,
  usePlans,
  useSuspendTenant,
  useActivateTenant,
  useImpersonate,
  useUpdateSubscription,
} from '@/lib/hooks/use-super-admin';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';
import { superAdminApi } from '@/lib/api/super-admin.api';

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function SchoolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: school, isLoading } = useTenant(id);
  const { data: plans } = usePlans();
  const suspendTenant = useSuspendTenant();
  const activateTenant = useActivateTenant();
  const impersonate = useImpersonate();
  const updateSubscription = useUpdateSubscription();
  const { setAuth } = useAuthStore();
  const { setTenant } = useTenantStore();
  const [changingPlan, setChangingPlan] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', address: '', panNumber: '' });

  async function handleImpersonate() {
    if (!school) return;
    try {
      const res = await impersonate.mutateAsync(school.id);
      const token = res.data.data;
      setAuth(token.accessToken, {
        id: '',
        email: '',
        role: 'SCHOOL_OWNER',
        tenantId: null,
        tenantSlug: token.tenantSlug,
      });
      setTenant({ slug: token.tenantSlug, name: token.schoolName });
      toast.warning('Impersonation active — all actions are audited', { duration: 6000 });
      window.open(`/?tenant=${token.tenantSlug}`, '_blank');
    } catch {
      toast.error('Impersonation failed');
    }
  }

  async function handleChangePlan(planId: string | null) {
    if (!planId || !school) return;
    setChangingPlan(true);
    try {
      await updateSubscription.mutateAsync({ tenantId: school.id, data: { planId } });
      toast.success('Plan updated');
    } catch {
      toast.error('Failed to update plan');
    } finally {
      setChangingPlan(false);
    }
  }

  function openEdit() {
    if (!school) return;
    setEditForm({
      name: school.name,
      email: school.email ?? '',
      phone: school.phone ?? '',
      address: school.address ?? '',
      panNumber: school.panNumber ?? '',
    });
    setEditOpen(true);
  }

  async function handleEditSave() {
    if (!school) return;
    try {
      await superAdminApi.updateTenant(school.id, editForm);
      toast.success('School updated');
      setEditOpen(false);
      router.refresh();
    } catch {
      toast.error('Failed to update school');
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!school) {
    return <div className="text-center py-20 text-gray-400 dark:text-gray-500">School not found</div>;
  }

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/super-admin/schools"
          className="inline-flex items-center gap-1.5 text-theme-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Schools
        </Link>
      </div>

      <PageHeader
        title={school.name}
        description={`${school.slug}.aaramvashikshya.com`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={openEdit}>
              <Pencil className="h-4 w-4 mr-1.5" />
              Edit
            </Button>
            <ConfirmDialog
              title="Impersonate School Owner"
              description={`You are about to access ${school.name} as SCHOOL_OWNER. All actions will be audited. Continue?`}
              confirmLabel="Impersonate"
              trigger={
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-4 w-4 mr-1.5" />
                  Impersonate
                </Button>
              }
              onConfirm={handleImpersonate}
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <InfoCard title="School Information">
          <dl className="space-y-3 text-sm">
            {[
              { label: 'Name', value: school.name },
              { label: 'Slug', value: school.slug, mono: true },
              { label: 'Email', value: school.email ?? '—' },
              { label: 'Phone', value: school.phone ?? '—' },
              { label: 'Address', value: school.address ?? '—' },
              { label: 'PAN', value: school.panNumber ?? '—' },
              {
                label: 'Primary Color',
                value: school.primaryColor,
                render: (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded-full border border-gray-200 dark:border-gray-700" style={{ background: school.primaryColor }} />
                    {school.primaryColor}
                  </span>
                ),
              },
            ].map(({ label, value, mono, render }) => (
              <div key={label} className="flex">
                <dt className="w-32 text-gray-400 dark:text-gray-500 flex-shrink-0">{label}</dt>
                <dd className={`text-gray-800 dark:text-white ${mono ? 'font-mono text-theme-xs' : ''}`}>
                  {render ?? value}
                </dd>
              </div>
            ))}
          </dl>
        </InfoCard>

        <InfoCard title="Subscription">
          <div className="space-y-4">
            <dl className="space-y-3 text-sm">
              <div className="flex">
                <dt className="w-32 text-gray-400 dark:text-gray-500">Plan</dt>
                <dd className="font-medium text-gray-800 dark:text-white">{school.planName}</dd>
              </div>
              <div className="flex">
                <dt className="w-32 text-gray-400 dark:text-gray-500">Status</dt>
                <dd><StatusBadge status={school.subscriptionStatus} /></dd>
              </div>
              <div className="flex">
                <dt className="w-32 text-gray-400 dark:text-gray-500">Account</dt>
                <dd><StatusBadge status={school.isActive ? 'ACTIVE' : 'SUSPENDED'} /></dd>
              </div>
              {school.trialEndsAt && (
                <div className="flex">
                  <dt className="w-32 text-gray-400 dark:text-gray-500">Trial Ends</dt>
                  <dd className="text-gray-800 dark:text-white">{new Date(school.trialEndsAt).toLocaleDateString()}</dd>
                </div>
              )}
              {school.subscriptionEndsAt && (
                <div className="flex">
                  <dt className="w-32 text-gray-400 dark:text-gray-500">Expires</dt>
                  <dd className="text-gray-800 dark:text-white">{new Date(school.subscriptionEndsAt).toLocaleDateString()}</dd>
                </div>
              )}
            </dl>

            <div className="pt-3 border-t border-gray-200 dark:border-gray-800 space-y-2">
              <p className="text-theme-xs text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider">Change Plan</p>
              <Select value={school.planId} onValueChange={handleChangePlan} disabled={changingPlan}>
                <SelectTrigger className="w-full">
                  <span>{plans?.find((p) => p.id === school.planId)?.name ?? 'Select plan'}</span>
                </SelectTrigger>
                <SelectContent>
                  {plans?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="pt-3 border-t border-gray-200 dark:border-gray-800">
              {school.isActive ? (
                <ConfirmDialog
                  title="Suspend School"
                  description={`Suspend ${school.name}? They will lose access immediately.`}
                  confirmLabel="Suspend"
                  variant="destructive"
                  trigger={
                    <Button variant="outline" size="sm" className="text-error-600 border-error-200 hover:bg-error-50 w-full dark:border-error-800 dark:hover:bg-error-500/10">
                      Suspend School
                    </Button>
                  }
                  onConfirm={async () => {
                    await suspendTenant.mutateAsync(school.id);
                    toast.success('School suspended');
                    router.refresh();
                  }}
                />
              ) : (
                <ConfirmDialog
                  title="Activate School"
                  description={`Activate ${school.name}?`}
                  confirmLabel="Activate"
                  trigger={
                    <Button variant="outline" size="sm" className="text-success-700 border-success-200 hover:bg-success-50 w-full dark:border-success-800 dark:hover:bg-success-500/10">
                      Activate School
                    </Button>
                  }
                  onConfirm={async () => {
                    await activateTenant.mutateAsync(school.id);
                    toast.success('School activated');
                    router.refresh();
                  }}
                />
              )}
            </div>
          </div>
        </InfoCard>
      </div>

      <InfoCard title="Usage">
        <div className="flex gap-8">
          <div>
            <p className="text-theme-xs text-gray-400 dark:text-gray-500 mb-0.5">Students</p>
            <p className="text-3xl font-bold text-gray-800 dark:text-white">{school.studentCount}</p>
          </div>
          <div className="border-l border-gray-200 dark:border-gray-800 pl-8">
            <p className="text-theme-xs text-gray-400 dark:text-gray-500 mb-0.5">Staff</p>
            <p className="text-3xl font-bold text-gray-800 dark:text-white">{school.staffCount}</p>
          </div>
        </div>
      </InfoCard>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Edit School</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>School Name</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>PAN Number</Label>
                <Input value={editForm.panNumber} onChange={(e) => setEditForm((f) => ({ ...f, panNumber: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input value={editForm.address} onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button className="bg-brand-500 hover:bg-brand-600 text-white" onClick={handleEditSave}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

---

## Task 9: Fix Plans Page — Dialog State Management

**Files:**
- Modify: `apps/web/app/super-admin/plans/page.tsx`

Key fix: The `PlanFormDialog` doesn't reset its state when opened for create vs edit. Need to sync form state with `initial` prop changes.

- [ ] **Step 1: Fix PlanFormDialog to sync with initial prop**

Add a `useEffect` inside `PlanFormDialog` that resets form when `initial` changes:

```tsx
import { useEffect, useState } from 'react';
// ... inside PlanFormDialog component:
useEffect(() => {
  setForm(initial);
}, [initial]);
```

Also add loading state to the Deactivate button and fix the edit dialog to properly close.

The full updated `plans/page.tsx` — key changes:
1. Add `useEffect` in `PlanFormDialog` to sync form with `initial`
2. Add `isPending` state to Deactivate button
3. Add loading spinner to Edit button when `updatePlan.isPending`

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

---

## Task 10: Fix Audit Page — Add Filters

**Files:**
- Modify: `apps/web/app/super-admin/audit/page.tsx`

Add action type filter and admin email filter to the audit log page.

- [ ] **Step 1: Add filter dropdowns to audit page**

Add above the table:
```tsx
<div className="flex gap-3 mb-4 flex-wrap">
  <Select value={actionFilter} onValueChange={setActionFilter}>
    <SelectTrigger className="w-40">
      <span className="truncate">{actionFilter || 'All Actions'}</span>
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="">All Actions</SelectItem>
      <SelectItem value="TENANT_CREATED">Created</SelectItem>
      <SelectItem value="TENANT_SUSPENDED">Suspended</SelectItem>
      <SelectItem value="TENANT_ACTIVATED">Activated</SelectItem>
      <SelectItem value="PLAN_CHANGED">Plan Changed</SelectItem>
      <SelectItem value="IMPERSONATION">Impersonation</SelectItem>
    </SelectContent>
  </Select>
</div>
```

Filter the `logs` array client-side based on `actionFilter`.

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1