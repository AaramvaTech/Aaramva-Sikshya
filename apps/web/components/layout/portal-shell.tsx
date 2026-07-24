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
