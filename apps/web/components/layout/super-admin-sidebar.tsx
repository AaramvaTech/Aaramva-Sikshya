'use client';

import Image from 'next/image';
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

  function isActive(href: string): boolean {
    if (href === '/super-admin/dashboard') return pathname === href;
    return pathname.startsWith(href);
  }

  async function handleLogout() {
    try {
      await superAdminApi.logout();
    } catch {
      /* ignore */
    }
    logout();
    toast.success('Logged out');
    if (typeof window !== 'undefined') window.location.href = '/super-admin/login';
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
      <div
        className={cn(
          'flex items-center gap-3 px-5 py-5 border-b border-white/[0.08]',
          !showLabels && 'lg:justify-center lg:px-0',
        )}
      >
        {showLabels ? (
          <div className="flex items-center gap-3 min-w-0">
            <Image
              src="/icon.png"
              alt="Aaramva Shikshya"
              width={36}
              height={36}
              className="object-contain flex-shrink-0 brightness-0 invert"
              priority
            />
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">Aaramva Shikshya</p>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                Platform Admin
              </p>
            </div>
          </div>
        ) : (
          <Image
            src="/icon.png"
            alt="AS"
            width={32}
            height={32}
            className="object-contain brightness-0 invert flex-shrink-0"
            priority
          />
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
                {group.items.map(({ label, href, icon: Icon }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={() => {
                        if (isMobileOpen) toggleMobileSidebar();
                      }}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive(href)
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
                ))}
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
