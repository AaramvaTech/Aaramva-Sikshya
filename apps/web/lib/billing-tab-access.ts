import type { Role } from '@/types/api.types';

/** UI-2 §3 — the Billing tab is gated to the same roles BILL-2's endpoints
 * require (ACCOUNTANT_AND_ABOVE), mirrored client-side the way
 * app/(school)/reports/page.tsx already does for its own ACCOUNTANT-only
 * tab — not the "hidden client-side" claim UI-1's spec made and never built
 * (BILL-BUGS.md UI-1-SPEC-DRIFT). Pulled out of students/[id]/page.tsx so
 * the claim is a real, unit-tested predicate, not just a description. */
export const BILLING_TAB_ROLES: Role[] = ['SCHOOL_OWNER', 'PRINCIPAL', 'ACADEMIC_COORDINATOR', 'ACCOUNTANT'];

export function canSeeBillingTab(role: Role | null | undefined): boolean {
  return !!role && BILLING_TAB_ROLES.includes(role);
}
