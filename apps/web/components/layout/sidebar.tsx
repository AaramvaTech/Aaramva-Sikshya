'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, CheckSquare, BookOpen,
  CreditCard, FileText, UserCog, Library,
  MessageSquare, BookMarked,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';

const NAV_SECTIONS = [
  {
    label: null,
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['all'] },
    ],
  },
  {
    label: 'SCHOOL',
    items: [
      { href: '/students',      icon: Users,         label: 'Students',      roles: ['PRINCIPAL','ACADEMIC_COORDINATOR','TEACHER'] },
      { href: '/attendance',    icon: CheckSquare,   label: 'Attendance',    roles: ['TEACHER','PRINCIPAL','ACADEMIC_COORDINATOR'] },
      { href: '/academic',      icon: BookOpen,      label: 'Academic',      roles: ['PRINCIPAL','ACADEMIC_COORDINATOR'] },
      { href: '/exams',         icon: FileText,      label: 'Examinations',  roles: ['PRINCIPAL','ACADEMIC_COORDINATOR','TEACHER'] },
    ],
  },
  {
    label: 'ADMINISTRATION',
    items: [
      { href: '/finance',       icon: CreditCard,    label: 'Finance',       roles: ['ACCOUNTANT','PRINCIPAL','SCHOOL_OWNER'] },
      { href: '/hr',            icon: UserCog,       label: 'HR & Staff',    roles: ['PRINCIPAL','SCHOOL_OWNER'] },
      { href: '/library',       icon: Library,       label: 'Library',       roles: ['LIBRARIAN','PRINCIPAL'] },
      { href: '/communication', icon: MessageSquare, label: 'Communication', roles: ['PRINCIPAL','TEACHER'] },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const tenant = useTenantStore((s) => s);

  function canSee(roles: string[]) {
    if (roles.includes('all')) return true;
    return user?.role ? roles.includes(user.role) : false;
  }

  return (
    <aside className="flex flex-col w-60 min-h-screen bg-white border-r border-gray-100">
      {/* School logo / name */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-100">
        {tenant.logoUrl ? (
          <Image
            src={tenant.logoUrl}
            alt={tenant.name ?? 'School'}
            width={36}
            height={36}
            className="rounded object-contain"
          />
        ) : (
          <div className="h-9 w-9 rounded bg-[#1A5C38]/10 flex items-center justify-center text-[#1A5C38] font-bold text-sm flex-shrink-0">
            {(tenant.name ?? tenant.slug ?? 'S').slice(0, 2).toUpperCase()}
          </div>
        )}
        <span className="font-semibold text-sm text-gray-900 truncate">
          {tenant.name ?? tenant.slug ?? 'School'}
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label ?? 'main'}>
            {section.label && (
              <p className="px-2 mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                {section.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.filter((i) => canSee(i.roles)).map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                        active
                          ? 'bg-[#1A5C38] text-white'
                          : 'text-gray-600 hover:bg-gray-50',
                      )}
                    >
                      <item.icon
                        className={cn(
                          'h-4 w-4 flex-shrink-0',
                          active ? 'text-white' : 'text-gray-400',
                        )}
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Powered by footer */}
      <div className="px-4 py-3 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <BookMarked className="h-3 w-3 text-gray-300 flex-shrink-0" />
          <span className="text-[10px] text-gray-400">Powered by Aaramva Shikshya</span>
        </div>
      </div>
    </aside>
  );
}
