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
