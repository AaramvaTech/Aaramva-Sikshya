'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import { useSidebar } from '@/context/sidebar-context';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';
import { useLocaleStore } from '@/store/locale.store';
import { useParentStore } from '@/store/parent.store';
import { authApi } from '@/lib/api/auth.api';
import { ChildSwitcher } from '@/components/parent/child-switcher';
import type { Role } from '@/types/api.types';

// Kept local and separate from admin's useRoleLabels() hook on purpose: that
// hook calls a TEACHER_AND_ABOVE-gated HR endpoint that 403s for STUDENT/
// PARENT (documented WEB-P Phase 1 decision — do not "simplify" this back
// to useRoleLabels() when copying admin's UserMenu pattern).
const ROLE_LABELS: Partial<Record<Role, string>> = {
  STUDENT: 'Student',
  PARENT: 'Parent',
  TEACHER: 'Teacher',
};

function UserMenu() {
  const router = useRouter();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const clearTenant = useTenantStore((s) => s.clear);
  const clearSelectedChild = useParentStore((s) => s.clear);
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const displayName = user
    ? user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.email
    : 'User';

  const initials = user
    ? user.firstName && user.lastName
      ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
      : user.email.slice(0, 2).toUpperCase()
    : 'U';

  const roleLabel = user?.role ? ROLE_LABELS[user.role] ?? user.role : '';

  async function handleLogout() {
    try {
      await authApi.logout();
    } finally {
      logout();
      clearTenant();
      // Mirrors PortalShell's pre-existing logout hygiene: a same-tab login
      // as a different parent must not inherit the prior parent's selection.
      clearSelectedChild();
      router.push('/login');
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((p) => !p);
        }}
        className="flex items-center gap-2 text-gray-700 dark:text-gray-400"
      >
        <span className="flex items-center justify-center h-10 w-10 rounded-full bg-brand-500 text-white text-sm font-semibold">
          {initials}
        </span>
        <span className="hidden md:block text-theme-sm font-medium">{displayName}</span>
        <svg
          className={`stroke-gray-500 dark:stroke-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          width="16"
          height="16"
          viewBox="0 0 18 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M4.3125 8.65625L9 13.3437L13.6875 8.65625" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-4 w-60 flex flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900 z-9999">
          <div className="mb-3">
            <span className="block font-medium text-gray-700 text-theme-sm dark:text-gray-300">
              {displayName}
            </span>
            <span className="block text-theme-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {roleLabel}
            </span>
          </div>
          <div className="border-t border-gray-200 dark:border-gray-800 pt-3">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-2 font-medium text-gray-700 rounded-lg text-theme-sm hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300 transition-colors"
            >
              {t('actions.signOut')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * New slim header for the student/parent/teacher portal (WEB-P UI/UX pass),
 * replacing PortalShell's previous single-bar header that crammed nav links
 * + ChildSwitcher + language toggle + role pill + sign-out into one row.
 * Nav links now live in PortalSidebar; this header mirrors admin Header.tsx's
 * shape (sidebar toggle left, actions right).
 */
export function PortalHeader() {
  const { isMobileOpen, toggleSidebar, toggleMobileSidebar } = useSidebar();
  const { locale, setLocale } = useLocaleStore();
  const role = useAuthStore((s) => s.user?.role);

  function handleToggle() {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      toggleSidebar();
    } else {
      toggleMobileSidebar();
    }
  }

  return (
    <header className="sticky top-0 flex w-full bg-white border-gray-200 z-9999 dark:border-gray-800 dark:bg-gray-900 lg:border-b">
      <div className="flex flex-col items-center justify-between grow lg:flex-row lg:px-6">
        <div className="flex items-center justify-between w-full gap-2 px-3 py-3 border-b border-gray-200 dark:border-gray-800 sm:gap-4 lg:justify-normal lg:border-b-0 lg:px-0 lg:py-4">
          <div className="flex items-center gap-2 lg:hidden">
            <Image src="/icon.png" alt="Aaramva Shikshya" width={28} height={28} className="object-contain" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Aaramva Shikshya</span>
          </div>

          <button
            onClick={handleToggle}
            className="items-center justify-center w-10 h-10 text-gray-500 border border-gray-200 rounded-lg z-9999 dark:border-gray-800 lg:flex dark:text-gray-400 lg:h-11 lg:w-11 lg:border hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Toggle Sidebar"
          >
            {isMobileOpen ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" clipRule="evenodd" d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z" fill="currentColor" />
              </svg>
            ) : (
              <svg width="16" height="12" viewBox="0 0 16 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" clipRule="evenodd" d="M0.583252 1C0.583252 0.585788 0.919038 0.25 1.33325 0.25H14.6666C15.0808 0.25 15.4166 0.585786 15.4166 1C15.4166 1.41421 15.0808 1.75 14.6666 1.75L1.33325 1.75C0.919038 1.75 0.583252 1.41422 0.583252 1ZM0.583252 11C0.583252 10.5858 0.919038 10.25 1.33325 10.25L14.6666 10.25C15.0808 10.25 15.4166 10.5858 15.4166 11C15.4166 11.4142 15.0808 11.75 14.6666 11.75L1.33325 11.75C0.919038 11.75 0.583252 11.4142 0.583252 11ZM1.33325 5.25C0.919038 5.25 0.583252 5.58579 0.583252 6C0.583252 6.41421 0.919038 6.75 1.33325 6.75L7.99992 6.75C8.41413 6.75 8.74992 6.41421 8.74992 6C8.74992 5.58579 8.41413 5.25 7.99992 5.25L1.33325 5.25Z" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>

        <div className="flex items-center justify-between w-full gap-4 px-5 py-4 lg:flex lg:justify-end lg:px-0">
          <div className="flex items-center gap-3">
            {role === 'PARENT' && <ChildSwitcher />}
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
          </div>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
