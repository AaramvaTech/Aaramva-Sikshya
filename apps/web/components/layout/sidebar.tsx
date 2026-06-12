'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, CheckSquare, BookOpen,
  CreditCard, FileText, UserCog, Library,
  MessageSquare, ChevronDown, Settings,
} from 'lucide-react';
import { useSidebar } from '@/context/sidebar-context';
import { useTenantStore } from '@/store/tenant.store';

type SubItem = { name: string; path: string };
type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: SubItem[];
};

const navItems: NavItem[] = [
  {
    icon: <LayoutDashboard className="w-5 h-5" />,
    name: 'Dashboard',
    path: '/dashboard',
  },
  {
    icon: <Users className="w-5 h-5" />,
    name: 'Students',
    subItems: [
      { name: 'All Students', path: '/students' },
      { name: 'Admit Student', path: '/students/new' },
    ],
  },
  {
    icon: <CheckSquare className="w-5 h-5" />,
    name: 'Attendance',
    subItems: [
      { name: 'Overview', path: '/attendance' },
      { name: 'Mark Attendance', path: '/attendance/mark' },
      { name: 'Reports', path: '/attendance/reports' },
    ],
  },
  {
    icon: <BookOpen className="w-5 h-5" />,
    name: 'Academic',
    subItems: [
      { name: 'Academic Years', path: '/academic/years' },
      { name: 'Classes', path: '/academic/classes' },
      { name: 'Subjects', path: '/academic/subjects' },
      { name: 'Timetable', path: '/academic/timetable' },
    ],
  },
  {
    icon: <CreditCard className="w-5 h-5" />,
    name: 'Finance',
    subItems: [
      { name: 'Overview', path: '/finance' },
      { name: 'Invoices', path: '/finance/invoices' },
      { name: 'Fee Structures', path: '/finance/fee-structures' },
      { name: 'Reports', path: '/finance/reports' },
    ],
  },
  {
    icon: <FileText className="w-5 h-5" />,
    name: 'Examinations',
    subItems: [
      { name: 'Exam Types', path: '/exams' },
      { name: 'Schedule', path: '/exams/schedule' },
      { name: 'Enter Marks', path: '/exams/marks' },
      { name: 'Results', path: '/exams/results' },
    ],
  },
  {
    icon: <UserCog className="w-5 h-5" />,
    name: 'HR & Staff',
    subItems: [
      { name: 'Staff', path: '/hr/staff' },
      { name: 'Leave', path: '/hr/leave' },
      { name: 'Payroll', path: '/hr/payroll' },
      { name: 'Setup', path: '/hr/setup' },
    ],
  },
  {
    icon: <Library className="w-5 h-5" />,
    name: 'Library',
    subItems: [
      { name: 'Books', path: '/library/books' },
      { name: 'Members', path: '/library/members' },
      { name: 'Issues', path: '/library/issues' },
    ],
  },
  {
    icon: <MessageSquare className="w-5 h-5" />,
    name: 'Communication',
    subItems: [
      { name: 'Notices', path: '/communication/notices' },
      { name: 'SMS Center', path: '/communication/sms' },
      { name: 'Notifications', path: '/communication/notifications' },
    ],
  },
  {
    icon: <Settings className="w-5 h-5" />,
    name: 'Settings',
    path: '/settings',
  },
];

export function Sidebar() {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();
  const tenant = useTenantStore((s) => s);

  const [openSubmenu, setOpenSubmenu] = useState<number | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<number, number>>({});
  const subMenuRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const isActive = useCallback(
    (path: string, exact = false) => {
      if (pathname === path) return true;
      if (!exact && pathname.startsWith(path + '/')) return true;
      return false;
    },
    [pathname],
  );

  const isGroupActive = useCallback(
    (item: NavItem) => {
      if (item.path) return isActive(item.path);
      return item.subItems?.some((s) => isActive(s.path)) ?? false;
    },
    [isActive],
  );

  // Auto-open submenu for active route
  useEffect(() => {
    let matched = false;
    navItems.forEach((nav, idx) => {
      if (nav.subItems?.some((s) => isActive(s.path))) {
        setOpenSubmenu(idx);
        matched = true;
      }
    });
    if (!matched) setOpenSubmenu(null);
  }, [pathname, isActive]);

  // Measure submenu heights for animation
  useEffect(() => {
    if (openSubmenu !== null && subMenuRefs.current[openSubmenu]) {
      setSubMenuHeight((prev) => ({
        ...prev,
        [openSubmenu]: subMenuRefs.current[openSubmenu]?.scrollHeight ?? 0,
      }));
    }
  }, [openSubmenu]);

  const handleSubmenuToggle = (idx: number) => {
    setOpenSubmenu((prev) => (prev === idx ? null : idx));
  };

  const showLabels = isExpanded || isHovered || isMobileOpen;

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200
        ${showLabels ? 'w-[290px]' : 'w-[90px]'}
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Logo */}
      <div
        className={`py-8 flex  ${
          !showLabels ? 'lg:justify-center' : 'justify-start'
        }`}
      >
        <Link href="/dashboard" className="flex items-center gap-3 min-w-0">
          {tenant.logoUrl ? (
            <Image
              src={tenant.logoUrl}
              alt={tenant.name ?? 'School'}
              width={36}
              height={36}
              className="rounded-lg object-contain flex-shrink-0"
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
                  School Admin
                </span>
              )}
            </div>
          )}
        </Link>
      </div>

      {/* Navigation */}
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
                {navItems.map((nav, idx) => (
                  <li key={nav.name}>
                    {nav.subItems ? (
                      <button
                        onClick={() => handleSubmenuToggle(idx)}
                        className={`menu-item group w-full cursor-pointer ${
                          isGroupActive(nav) ? 'menu-item-active' : 'menu-item-inactive'
                        } ${!showLabels ? 'lg:justify-center' : 'lg:justify-start'}`}
                      >
                        <span
                          className={`${
                            isGroupActive(nav)
                              ? 'menu-item-icon-active'
                              : 'menu-item-icon-inactive'
                          }`}
                        >
                          {nav.icon}
                        </span>
                        {showLabels && (
                          <span className="menu-item-text flex-1 text-left">{nav.name}</span>
                        )}
                        {showLabels && (
                          <ChevronDown
                            className={`ml-auto w-5 h-5 transition-transform duration-200 ${
                              openSubmenu === idx
                                ? 'rotate-180 text-brand-500'
                                : ''
                            }`}
                          />
                        )}
                      </button>
                    ) : (
                      nav.path && (
                        <Link
                          href={nav.path}
                          className={`menu-item group ${
                            isActive(nav.path) ? 'menu-item-active' : 'menu-item-inactive'
                          }`}
                        >
                          <span
                            className={`${
                              isActive(nav.path)
                                ? 'menu-item-icon-active'
                                : 'menu-item-icon-inactive'
                            }`}
                          >
                            {nav.icon}
                          </span>
                          {showLabels && (
                            <span className="menu-item-text">{nav.name}</span>
                          )}
                        </Link>
                      )
                    )}
                    {nav.subItems && showLabels && (
                      <div
                        ref={(el) => {
                          subMenuRefs.current[idx] = el;
                        }}
                        className="overflow-hidden transition-all duration-300"
                        style={{
                          height:
                            openSubmenu === idx
                              ? `${subMenuHeight[idx]}px`
                              : '0px',
                        }}
                      >
                        <ul className="mt-2 space-y-1 ml-9">
                          {nav.subItems.map((sub) => (
                            <li key={sub.name}>
                              <Link
                                href={sub.path}
                                className={`menu-dropdown-item ${
                                  isActive(sub.path, true)
                                    ? 'menu-dropdown-item-active'
                                    : 'menu-dropdown-item-inactive'
                                }`}
                              >
                                {sub.name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </nav>
      </div>
      {/* Powered by footer */}
      <div className={`py-4 border-t border-gray-100 dark:border-gray-800 flex items-center ${showLabels ? 'justify-start gap-2 px-2' : 'justify-center'}`}>
        {showLabels ? (
          <>
            <span className="text-[10px] text-gray-400 uppercase tracking-widest font-medium whitespace-nowrap">
              Powered by
            </span>
            <Image
              src="/logo.png"
              alt="Aaramva Shikshya"
              width={110}
              height={28}
              className="object-contain"
            />
          </>
        ) : (
          <div className="relative h-7 w-7 overflow-hidden">
            <Image
              src="/logo.png"
              alt="Aaramva Shikshya"
              fill
              className="object-cover object-left"
            />
          </div>
        )}
      </div>
    </aside>
  );
}
