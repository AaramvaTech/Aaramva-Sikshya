'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { AccessDenied } from './access-denied';
import { useAuthStore } from '@/store/auth.store';
import { useSidebar } from '@/context/sidebar-context';
import { useOnboardingStatus } from '@/lib/hooks/use-onboarding';
import { canAccess, homeRoute } from '@/lib/route-access';

function Backdrop() {
  const { isMobileOpen, toggleMobileSidebar } = useSidebar();
  if (!isMobileOpen) return null;
  return (
    <div
      className="fixed inset-0 z-40 bg-gray-900/50 lg:hidden"
      onClick={toggleMobileSidebar}
    />
  );
}

export function SchoolShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, isInitialized, user } = useAuthStore();
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const { data: onboarding } = useOnboardingStatus();
  const routedIntoSetup = useRef(false);

  useEffect(() => {
    if (isInitialized && !accessToken) {
      router.replace('/login');
    }
  }, [isInitialized, accessToken, router]);

  // Task 5 — a PLATFORM_ADMIN must never render the school shell. Send them to
  // their own portal instead of showing a 403 (their home is super-admin).
  useEffect(() => {
    if (isInitialized && accessToken && user?.role === 'PLATFORM_ADMIN') {
      router.replace('/super-admin/dashboard');
    }
  }, [isInitialized, accessToken, user?.role, router]);

  // Task 4 — a returning STUDENT/PARENT (marker cookie but no live session yet)
  // lands here via the role-blind proxy redirect to /dashboard. They don't
  // belong in the school shell at all (no /dashboard access), so bounce them
  // to their own portal instead of showing a 403. TEACHER is deliberately
  // excluded — it still legitimately renders the admin dashboard.
  useEffect(() => {
    if (isInitialized && accessToken && (user?.role === 'STUDENT' || user?.role === 'PARENT')) {
      router.replace(homeRoute(user.role));
    }
  }, [isInitialized, accessToken, user?.role, router]);

  // POL-1 T4 — a user on an emailed temporary password cannot use the portal
  // until they set their own. /change-password lives in the (auth) group (no
  // shell), so this effect cannot loop; logout stays reachable from that page.
  useEffect(() => {
    if (isInitialized && accessToken && user?.mustChangePassword) {
      router.replace('/change-password');
    }
  }, [isInitialized, accessToken, user?.mustChangePassword, router]);

  // Route a new SCHOOL_OWNER into the setup wizard on login when setup isn't
  // complete — once per session, so the owner can still navigate away afterward
  // (the sidebar "Setup" entry keeps it obvious until done).
  useEffect(() => {
    if (!isInitialized || !accessToken || user?.role !== 'SCHOOL_OWNER') return;
    if (!onboarding || onboarding.completed || routedIntoSetup.current) return;
    if (typeof window !== 'undefined' && sessionStorage.getItem('ob-redirected')) {
      routedIntoSetup.current = true;
      return;
    }
    routedIntoSetup.current = true;
    if (typeof window !== 'undefined') sessionStorage.setItem('ob-redirected', '1');
    if (pathname !== '/onboarding') router.replace('/onboarding');
  }, [isInitialized, accessToken, user?.role, onboarding, pathname, router]);

  // Loader until the session is fully hydrated — including the brief window where
  // the token is set but the user's role hasn't loaded yet (refresh in flight) —
  // so the 403 screen never flashes before the role is known.
  if (!isInitialized || (accessToken && !user?.role)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-gray-900">
        <Image src="/logo.png" alt="Aaramva Shikshya" width={180} height={46} className="object-contain" priority />
        <Loader2 className="h-5 w-5 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (!accessToken) return null;
  // PLATFORM_ADMIN is being redirected to the super-admin portal (effect above).
  if (user?.role === 'PLATFORM_ADMIN') return null;

  const allowed = canAccess(user?.role, pathname);

  const mainMargin = isMobileOpen
    ? 'ml-0'
    : isExpanded || isHovered
    ? 'lg:ml-[290px]'
    : 'lg:ml-[90px]';

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <Backdrop />
      <div className={`relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden transition-all duration-300 ease-in-out ${mainMargin}`}>
        <Header />
        <main>
          <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
            {allowed ? children : <AccessDenied role={user?.role} />}
          </div>
        </main>
      </div>
    </div>
  );
}
