'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useAuthStore } from '@/store/auth.store';
import { useSidebar } from '@/context/sidebar-context';
import { SuperAdminSidebar } from './super-admin-sidebar';
import { SuperAdminHeader } from './super-admin-header';
import { cn } from '@/lib/utils';

export function SuperAdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, accessToken, isInitialized, logout } = useAuthStore();
  const sidebar = useSidebar();

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
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-950">
        <div className="bg-white rounded-2xl px-5 py-3 inline-flex">
          <Image src="/logo.png" alt="Aaramva Shikshya" width={180} height={46} className="object-contain" priority />
        </div>
        <Loader2 className="h-5 w-5 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (!accessToken || user?.role !== 'PLATFORM_ADMIN') return null;

  const mainMargin = sidebar.isMobileOpen
    ? 'ml-0'
    : sidebar.isExpanded || sidebar.isHovered
      ? 'lg:ml-[260px]'
      : 'lg:ml-[70px]';

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      <SuperAdminSidebar />
      {/* Mobile backdrop */}
      {sidebar.isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-900/50 lg:hidden"
          onClick={() => sidebar.toggleMobileSidebar()}
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
