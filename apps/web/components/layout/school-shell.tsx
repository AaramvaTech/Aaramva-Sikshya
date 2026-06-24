'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { useAuthStore } from '@/store/auth.store';
import { useSidebar } from '@/context/sidebar-context';
import { useOnboardingStatus } from '@/lib/hooks/use-onboarding';

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

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-gray-900">
        <Image src="/logo.png" alt="Aaramva Shikshya" width={180} height={46} className="object-contain" priority />
        <Loader2 className="h-5 w-5 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (!accessToken) return null;

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
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
