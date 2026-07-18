'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useSidebar } from '@/context/sidebar-context';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';
import { authApi } from '@/lib/api/auth.api';
import {
  useUnreadCount,
  useMyNotifications,
  useMarkAsRead,
  useMarkAllRead,
} from '@/lib/hooks/use-communication';
import { useRoleLabels } from '@/lib/hooks/use-hr';
import { roleLabelLookup } from '@/lib/role-labels';
import type { AppNotification } from '@/types/api.types';
import { Search } from 'lucide-react';

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: unreadCount = 0 } = useUnreadCount();
  const { data: notifData } = useMyNotifications({ page: 1, limit: 10 });
  const notifications: AppNotification[] = notifData?.data ?? [];
  const markAsRead = useMarkAsRead();
  const markAllRead = useMarkAllRead();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen((p) => !p)}
        className="relative flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full hover:text-gray-700 h-10 w-10 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        aria-label="Notifications"
      >
        {unreadCount != null && unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-orange-400 flex">
            <span className="absolute inline-flex w-full h-full bg-orange-400 rounded-full opacity-75 animate-ping" />
          </span>
        )}
        <svg className="fill-current" width="18" height="18" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
          <path fillRule="evenodd" clipRule="evenodd" d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H4.37504H15.625H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z" fill="currentColor" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-4 flex h-96 w-80 flex-col rounded-2xl border border-gray-200 bg-white shadow-theme-lg dark:border-gray-800 dark:bg-gray-900 z-9999">
          <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
            <h5 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Notifications</h5>
            {notifications.some((n) => !n.isRead) && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-xs text-brand-500 hover:text-brand-600 dark:text-brand-400"
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className="flex flex-col overflow-y-auto custom-scrollbar flex-1">
            {notifications.length === 0 ? (
              <li className="flex items-center justify-center flex-1">
                <p className="text-sm text-gray-400">No notifications</p>
              </li>
            ) : (
              notifications.map((notif) => (
                <li key={notif.id}>
                  <button
                    className={`w-full text-left flex gap-3 p-3 hover:bg-gray-50 dark:hover:bg-white/5 border-b border-gray-100 dark:border-gray-800 transition-colors ${
                      notif.isRead ? '' : 'bg-brand-25 dark:bg-brand-500/[0.05]'
                    }`}
                    onClick={() => { if (!notif.isRead) markAsRead.mutate(notif.id); setIsOpen(false); }}
                  >
                    <span className="block flex-1 min-w-0">
                      <span className="block text-theme-sm font-medium text-gray-800 dark:text-white/90 text-left leading-snug truncate">
                        {notif.title}
                      </span>
                      <span className="block text-theme-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2 text-left">
                        {notif.body}
                      </span>
                      <span className="block text-theme-xs text-gray-400 mt-1">{timeAgo(notif.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <div className="p-3 border-t border-gray-100 dark:border-gray-800">
            <a
              href="/communication/notifications"
              className="block text-center text-theme-xs text-brand-500 hover:text-brand-600 dark:text-brand-400 py-1"
            >
              View all notifications
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const clearTenant = useTenantStore((s) => s.clear);
  const { data: roleLabels } = useRoleLabels();
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

  async function handleLogout() {
    try { await authApi.logout(); } finally {
      logout();
      clearTenant();
      router.push('/login');
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen((p) => !p); }}
        className="flex items-center gap-2 text-gray-700 dark:text-gray-400"
      >
        <span className="flex items-center justify-center h-10 w-10 rounded-full bg-brand-500 text-white text-sm font-semibold">
          {initials}
        </span>
        <span className="hidden md:block text-theme-sm font-medium">{displayName}</span>
        <svg
          className={`stroke-gray-500 dark:stroke-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          width="16" height="16" viewBox="0 0 18 20" fill="none" xmlns="http://www.w3.org/2000/svg"
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
              {user?.role ? roleLabelLookup(roleLabels, user.role) : ''}
            </span>
          </div>
          <div className="border-t border-gray-200 dark:border-gray-800 pt-3">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-2 font-medium text-gray-700 rounded-lg text-theme-sm hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300 transition-colors"
            >
              <svg className="fill-gray-500 group-hover:fill-gray-700 dark:fill-gray-400" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" clipRule="evenodd" d="M15.1007 19.247C14.6865 19.247 14.3507 18.9112 14.3507 18.497L14.3507 14.245H12.8507V18.497C12.8507 19.7396 13.8581 20.747 15.1007 20.747H18.5007C19.7434 20.747 20.7507 19.7396 20.7507 18.497L20.7507 5.49609C20.7507 4.25345 19.7433 3.24609 18.5007 3.24609H15.1007C13.8581 3.24609 12.8507 4.25345 12.8507 5.49609V9.74501L14.3507 9.74501V5.49609C14.3507 5.08188 14.6865 4.74609 15.1007 4.74609L18.5007 4.74609C18.9149 4.74609 19.2507 5.08188 19.2507 5.49609L19.2507 18.497C19.2507 18.9112 18.9149 19.247 18.5007 19.247H15.1007ZM3.25073 11.9984C3.25073 12.2144 3.34204 12.4091 3.48817 12.546L8.09483 17.1556C8.38763 17.4485 8.86251 17.4487 9.15549 17.1559C9.44848 16.8631 9.44863 16.3882 9.15583 16.0952L5.81116 12.7484L16.0007 12.7484C16.4149 12.7484 16.7507 12.4127 16.7507 11.9984C16.7507 11.5842 16.4149 11.2484 16.0007 11.2484L5.81528 11.2484L9.15585 7.90554C9.44864 7.61255 9.44847 7.13767 9.15547 6.84488C8.86248 6.55209 8.3876 6.55226 8.09481 6.84525L3.52309 11.4202C3.35673 11.5577 3.25073 11.7657 3.25073 11.9984Z" fill="" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { isMobileOpen, isExpanded, isHovered, toggleSidebar, toggleMobileSidebar } = useSidebar();
  const searchRef = useRef<HTMLInputElement>(null);

  const handleToggle = () => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      toggleSidebar();
    } else {
      toggleMobileSidebar();
    }
  };

  // Cmd+K / Ctrl+K search shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header className="sticky top-0 flex w-full bg-white border-gray-200 z-9999 dark:border-gray-800 dark:bg-gray-900 lg:border-b">
      <div className="flex flex-col items-center justify-between grow lg:flex-row lg:px-6">
        {/* Left: sidebar toggle + mobile logo */}
        <div className="flex items-center justify-between w-full gap-2 px-3 py-3 border-b border-gray-200 dark:border-gray-800 sm:gap-4 lg:justify-normal lg:border-b-0 lg:px-0 lg:py-4">
          {/* Mobile logo — visible only when sidebar is hidden on mobile */}
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

        {/* Right: search + actions */}
        <div className="flex items-center justify-between w-full gap-4 px-5 py-4 lg:flex lg:justify-end lg:px-0">
          <div className="flex items-center gap-2 2xsm:gap-3">
            {/* Search bar */}
            <div className="hidden lg:block">
              {/* <form>
                <div className="relative">
                  <span className="absolute -translate-y-1/2 left-4 top-1/2 pointer-events-none">
                    <Search className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  </span>
                  <input
                    ref={searchRef}
                    type="text"
                    placeholder="Search or type command..."
                    className="dark:bg-dark-900 h-11 w-full rounded-lg border border-gray-200 bg-transparent py-2.5 pl-12 pr-14 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:bg-white/[0.03] dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 xl:w-[430px]"
                  />
                  <button type="button" className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-[7px] py-[4.5px] text-xs -tracking-[0.2px] text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
                    <span> ⌘ </span>
                    <span> K </span>
                  </button>
                </div>
              </form> */}
            </div>
            <NotificationBell />
          </div>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
