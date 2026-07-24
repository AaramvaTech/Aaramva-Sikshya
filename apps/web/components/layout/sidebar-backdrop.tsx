'use client';

import { useSidebar } from '@/context/sidebar-context';

/**
 * Mobile-only overlay that closes the sidebar drawer on tap-outside. Shared
 * by SchoolShell and PortalShell — both mount inside the same global
 * SidebarProvider (apps/web/app/providers.tsx).
 */
export function SidebarBackdrop() {
  const { isMobileOpen, toggleMobileSidebar } = useSidebar();
  if (!isMobileOpen) return null;
  return (
    <div
      className="fixed inset-0 z-40 bg-gray-900/50 lg:hidden"
      onClick={toggleMobileSidebar}
    />
  );
}
