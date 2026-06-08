'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, School, CreditCard, ClipboardList, LogOut, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { superAdminApi } from '@/lib/api/super-admin.api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const NAV_ITEMS = [
  { label: 'Overview', href: '/super-admin/dashboard', icon: LayoutDashboard },
  { label: 'Schools', href: '/super-admin/schools', icon: School },
  { label: 'Plans', href: '/super-admin/plans', icon: CreditCard },
  { label: 'Audit Log', href: '/super-admin/audit', icon: ClipboardList },
];

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, accessToken, isInitialized, logout } = useAuthStore();

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

  async function handleLogout() {
    try {
      await superAdminApi.logout();
    } catch {
      // ignore
    }
    logout();
    router.replace('/super-admin/login');
    toast.success('Logged out');
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <aside className="w-[260px] flex-shrink-0 bg-gray-900 flex flex-col">
        <div className="px-6 py-5 border-b border-white/[0.08]">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">
            Aaramva Shikshya
          </p>
          <p className="text-sm font-bold text-white">Platform Admin</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-brand-500/10 text-brand-400'
                    : 'text-gray-400 hover:bg-white/[0.06] hover:text-gray-200',
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-white/[0.08]">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-white/[0.06] hover:text-gray-200 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center px-6 flex-shrink-0 shadow-theme-xs">
          <span className="text-theme-sm font-semibold text-gray-700 dark:text-gray-300">
            Platform Administration Console
          </span>
          <div className="ml-auto flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-success-500 inline-block" />
            <span className="text-theme-sm text-gray-500 dark:text-gray-400">{user?.email}</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
