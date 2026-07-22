'use client';

import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';

/**
 * WEB-P Phase 1 Task 2 — skeleton landing page for the TEACHER portal.
 * Deliberately minimal: this phase only needs login -> landing to be
 * verifiable end-to-end. Real content arrives in a later phase.
 */
export default function TeacherPortalHomePage() {
  const role = useAuthStore((s) => s.user?.role);
  const tenantName = useTenantStore((s) => s.name);

  return (
    <div className="flex min-h-[60vh] items-center justify-center text-center">
      <p className="text-lg text-gray-700 dark:text-gray-300">
        Portal home — {role ?? 'Teacher'} — {tenantName ?? 'your school'}
      </p>
    </div>
  );
}
