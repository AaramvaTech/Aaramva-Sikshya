'use client';

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import type { Role } from '@/types/api.types';
import { homeRoute } from '@/lib/route-access';

/**
 * SEC-2 / Task 3 — the 403 screen shown when a hydrated user hits a section their
 * role can't access. Rendered in place (not a silent redirect) so a misconfigured
 * ROUTE_ACCESS surfaces instead of hiding. "Go home" targets the role's homeRoute.
 */
export function AccessDenied({ role }: { role: Role | null | undefined }) {
  const home = homeRoute(role);
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-error-50 text-error-500 dark:bg-error-500/10">
        <ShieldAlert className="h-7 w-7" />
      </div>
      <h1 className="mt-5 text-xl font-semibold text-gray-900 dark:text-white">
        You don&apos;t have access to this section
      </h1>
      <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
        Your role doesn&apos;t permit this page. If you think this is a mistake,
        contact your school administrator.
      </p>
      <Link
        href={home}
        className="mt-6 inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-600"
      >
        Go to {home === '/dashboard' ? 'Dashboard' : home.replace('/', '')}
      </Link>
    </div>
  );
}
