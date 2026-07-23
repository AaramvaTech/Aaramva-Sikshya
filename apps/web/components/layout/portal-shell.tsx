'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';
import { useLocaleStore } from '@/store/locale.store';
import { authApi } from '@/lib/api/auth.api';
import { canAccess, homeRoute } from '@/lib/route-access';
import { AccessDenied } from './access-denied';
import { ChildSwitcher } from '@/components/parent/child-switcher';
import type { Role } from '@/types/api.types';

/**
 * WEB-P Phase 1 Task 2 — the shared shell for the student/parent/teacher
 * portal. Follows the same session-hydration + access-gate + logout pattern
 * as SchoolShell (apps/web/components/layout/school-shell.tsx), but without
 * the admin sidebar/mobile-drawer machinery: a simple, static, desktop-
 * optimized header bar is all a skeleton phase needs. Do not add navigation
 * items or dashboards here — that's later phases.
 */

const ROLE_LABELS: Partial<Record<Role, string>> = {
  STUDENT: 'Student',
  PARENT: 'Parent',
  TEACHER: 'Teacher',
};

/**
 * WEB-P Phase 2 Task 1 — role-keyed nav items. TEACHER gets a real nav bar
 * here first (STUDENT and PARENT got their own arrays in Phases 4 and 5
 * respectively — see below; the t('nav.home') fallback further down now
 * only applies to roles with no dedicated portal nav array). English-only
 * labels for now: 'nav.home' is the only nav i18n key today, and inventing
 * unreviewed Nepali translations for these labels is a separate, later
 * i18n-content pass. WEB-P Phase 3 added the last four entries (Profile/
 * Leave/Timetable/Payroll — HR self-service) once their screens landed.
 */
const TEACHER_NAV_ITEMS: { href: string; label: string }[] = [
  { href: '/teacher', label: 'Dashboard' },
  { href: '/teacher/attendance', label: 'Attendance' },
  { href: '/teacher/marks', label: 'Marks' },
  { href: '/teacher/assignments', label: 'Assignments' },
  { href: '/teacher/profile', label: 'Profile' },
  { href: '/teacher/leave', label: 'Leave' },
  { href: '/teacher/timetable', label: 'Timetable' },
  { href: '/teacher/payroll', label: 'Payroll' },
];

/**
 * WEB-P Phase 4 Task 10 — student nav items. Six screens built and now wired
 * into the portal nav.
 */
const STUDENT_NAV_ITEMS: { href: string; label: string }[] = [
  { href: '/student', label: 'Dashboard' },
  { href: '/student/attendance', label: 'Attendance' },
  { href: '/student/timetable', label: 'Timetable' },
  { href: '/student/notices', label: 'Notices' },
  { href: '/student/results', label: 'Results' },
  { href: '/student/assignments', label: 'Assignments' },
];

/**
 * WEB-P Phase 5 Task 10 — parent nav items. Seven screens built and now
 * wired into the portal nav.
 */
const PARENT_NAV_ITEMS: { href: string; label: string }[] = [
  { href: '/parent', label: 'Dashboard' },
  { href: '/parent/attendance', label: 'Attendance' },
  { href: '/parent/timetable', label: 'Timetable' },
  { href: '/parent/notices', label: 'Notices' },
  { href: '/parent/results', label: 'Results' },
  { href: '/parent/assignments', label: 'Assignments' },
  { href: '/parent/fees', label: 'Fees' },
];

export function PortalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const { accessToken, isInitialized, user, logout } = useAuthStore();
  const { name: tenantName, clear: clearTenant } = useTenantStore();
  const { locale, setLocale } = useLocaleStore();

  useEffect(() => {
    if (isInitialized && !accessToken) {
      router.replace('/login');
    }
  }, [isInitialized, accessToken, router]);

  // POL-1 T4 — a user on an emailed temporary password cannot use any
  // authenticated shell, portal included, until they set their own.
  // /change-password lives in the (auth) group (no shell), so this effect
  // cannot loop; logout stays reachable from that page.
  useEffect(() => {
    if (isInitialized && accessToken && user?.mustChangePassword) {
      router.replace('/change-password');
    }
  }, [isInitialized, accessToken, user?.mustChangePassword, router]);

  async function handleLogout() {
    try {
      await authApi.logout();
    } finally {
      logout();
      clearTenant();
      router.push('/login');
    }
  }

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
  const roleLabel = user?.role ? ROLE_LABELS[user.role] ?? user.role : '';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="sticky top-0 z-50 flex w-full items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 md:px-6">
        <div className="flex items-center gap-4">
          <Image src="/icon.png" alt="Aaramva Shikshya" width={28} height={28} className="object-contain" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {tenantName ?? 'Aaramva Shikshya'}
          </span>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {user?.role === 'TEACHER' ? (
              TEACHER_NAV_ITEMS.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== '/teacher' && pathname.startsWith(item.href + '/'));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      active
                        ? 'text-sm font-semibold text-brand-600 dark:text-brand-400'
                        : 'text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    }
                  >
                    {item.label}
                  </Link>
                );
              })
            ) : user?.role === 'STUDENT' ? (
              STUDENT_NAV_ITEMS.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== '/student' && pathname.startsWith(item.href + '/'));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      active
                        ? 'text-sm font-semibold text-brand-600 dark:text-brand-400'
                        : 'text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    }
                  >
                    {item.label}
                  </Link>
                );
              })
            ) : user?.role === 'PARENT' ? (
              PARENT_NAV_ITEMS.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== '/parent' && pathname.startsWith(item.href + '/'));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      active
                        ? 'text-sm font-semibold text-brand-600 dark:text-brand-400'
                        : 'text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    }
                  >
                    {item.label}
                  </Link>
                );
              })
            ) : (
              <Link
                href={homeRoute(user?.role)}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                {t('nav.home')}
              </Link>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {user?.role === 'PARENT' && <ChildSwitcher />}
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
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
            {roleLabel}
          </span>
          <button
            onClick={handleLogout}
            className="text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            {t('actions.signOut')}
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
        {allowed ? children : <AccessDenied role={user?.role} />}
      </main>
    </div>
  );
}
