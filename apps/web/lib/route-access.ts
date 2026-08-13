import type { Role } from '@/types/api.types';

/**
 * SEC-2 — Single source of truth for web role-based access.
 *
 * ARCHITECTURAL NOTE (read before editing): this map is **UX + defense-in-depth
 * only**. The backend's `@Roles()` guards are the real security boundary — every
 * value below is derived from a specific backend controller guard (cited per row
 * in ROUTE_ACCESS.endpoint). Never grant a role here that the backend denies; if
 * the backend permits a role on a section, mirror it. Where a section is
 * management-oriented we mirror the backend WRITE guard; where it is view-oriented
 * we mirror the backend READ guard. STUDENT and PARENT now authenticate on this
 * web portal too (WEB-P), via their own dedicated portal routes (/student, /parent)
 * — but they are deliberately excluded from the WEB_STAFF_ROLES fallback below, so
 * they don't gain default access to unmapped admin routes.
 */

/** The six roles that use the *admin* school web portal (default fallback for any
 *  unmapped route). PLATFORM_ADMIN lives in the super-admin portal; STUDENT/PARENT
 *  have their own dedicated portal routes (/student, /parent) and are deliberately
 *  excluded from this fallback list — see the architectural note above. */
export const WEB_STAFF_ROLES: Role[] = [
  'SCHOOL_OWNER',
  'PRINCIPAL',
  'ACADEMIC_COORDINATOR',
  'ACCOUNTANT',
  'LIBRARIAN',
  'TEACHER',
];

// Backend role-group shorthands (resolved to concrete staff roles), so the rows
// below read like the controllers they mirror.
const OWNER_PRINCIPAL: Role[] = ['SCHOOL_OWNER', 'PRINCIPAL'];
const COORDINATOR_AND_ABOVE: Role[] = ['SCHOOL_OWNER', 'PRINCIPAL', 'ACADEMIC_COORDINATOR'];
const ACCOUNTANT_AND_ABOVE: Role[] = ['SCHOOL_OWNER', 'PRINCIPAL', 'ACADEMIC_COORDINATOR', 'ACCOUNTANT'];
const TEACHER_TIER: Role[] = ['SCHOOL_OWNER', 'PRINCIPAL', 'ACADEMIC_COORDINATOR', 'TEACHER'];
const LIBRARIAN_AND_ABOVE: Role[] = ['SCHOOL_OWNER', 'PRINCIPAL', 'ACADEMIC_COORDINATOR', 'ACCOUNTANT', 'LIBRARIAN'];
const SETTINGS_VIEWERS: Role[] = ['SCHOOL_OWNER', 'PRINCIPAL', 'ACADEMIC_COORDINATOR', 'ACCOUNTANT'];
// examination + communication reuse a broad TEACHER_AND_ABOVE that includes accountant + librarian.
const EXAM_COMMS_TIER: Role[] = ['SCHOOL_OWNER', 'PRINCIPAL', 'ACADEMIC_COORDINATOR', 'ACCOUNTANT', 'LIBRARIAN', 'TEACHER'];
// students roster read guard: everyone above + accountant + librarian.
const ROSTER_VIEWERS: Role[] = ['SCHOOL_OWNER', 'PRINCIPAL', 'ACADEMIC_COORDINATOR', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN'];

export type RouteAccess = { prefix: string; roles: Role[]; endpoint: string };

/**
 * Route-prefix → allowed roles, most-specific prefix first. `canAccess` uses
 * longest-prefix-wins, so more specific entries (e.g. /hr/payroll, /students/new)
 * override their parent section. Each row cites the backend endpoint whose guard
 * it mirrors (used by the SEC-2 parity check).
 */
export const ROUTE_ACCESS: RouteAccess[] = [
  // Students — roster is a read view (backend GET /students opens to 6 staff);
  // admit/import are narrower (backend POST /students).
  { prefix: '/students/new', roles: COORDINATOR_AND_ABOVE, endpoint: 'POST /students' },
  { prefix: '/students/import', roles: COORDINATOR_AND_ABOVE, endpoint: 'POST /students/import/commit' },
  { prefix: '/students', roles: ROSTER_VIEWERS, endpoint: 'GET /students' },

  // HR — staff/leave/setup are principal-tier management; payroll is accountant-tier.
  { prefix: '/hr/payroll', roles: ACCOUNTANT_AND_ABOVE, endpoint: 'GET /hr/payroll/months' },
  { prefix: '/hr', roles: OWNER_PRINCIPAL, endpoint: 'GET /hr/staff' },

  // Communication SMS send is narrower than the notices section as a whole.
  { prefix: '/communication/sms', roles: ['SCHOOL_OWNER', 'PRINCIPAL', 'ACCOUNTANT'], endpoint: 'POST /communication/sms/send' },
  { prefix: '/communication', roles: EXAM_COMMS_TIER, endpoint: 'POST /communication/notices' },

  { prefix: '/dashboard', roles: TEACHER_TIER, endpoint: 'GET /dashboard/weekly-attendance' },
  // Academic structure management. Coordinator can manage classes/subjects/timetable
  // (POST /classes = COORDINATOR_AND_ABOVE); note academic-year *creation* is narrower
  // (SCHOOL_OWNER/PRINCIPAL only), which the section still permits via the shell.
  { prefix: '/academic', roles: COORDINATOR_AND_ABOVE, endpoint: 'POST /classes' },
  { prefix: '/attendance', roles: TEACHER_TIER, endpoint: 'POST /attendance/students/bulk' },
  // EDU-1 assignments — mirrors ASSIGNMENT_MANAGER_ROLES on the backend
  // (PLATFORM_ADMIN/SCHOOL_OWNER/PRINCIPAL/ACADEMIC_COORDINATOR/TEACHER).
  { prefix: '/assignments', roles: TEACHER_TIER, endpoint: 'POST /assignments' },
  { prefix: '/finance', roles: ACCOUNTANT_AND_ABOVE, endpoint: 'GET /finance/fee-structures' },
  // UI-1 — the new BILL-rail admin UI, a separate top-level "Billing" nav
  // section (Srijan's ruling) but still under /finance/bill/... on the URL,
  // mirroring the backend's own path split. Same role tier as the row above;
  // listed separately since it cites a different backend controller
  // (BillCatalogController, not the old rail's FinanceController).
  { prefix: '/finance/bill/catalog', roles: ACCOUNTANT_AND_ABOVE, endpoint: 'GET /finance/fee-heads' },
  // UI-2 — bulk-assign page. Same tier as catalog above, citing
  // BillAssignmentController's own write guard.
  { prefix: '/finance/bill/assignment', roles: ACCOUNTANT_AND_ABOVE, endpoint: 'POST /finance/bill/fee-structures/:id/bulk-assign' },
  // UI-3 — bill runs (draft/review/post). Same tier, citing BillRunController's own guard.
  { prefix: '/finance/bill/runs', roles: ACCOUNTANT_AND_ABOVE, endpoint: 'POST /finance/bill/runs' },
  // UI-4 — payment counter. Same tier, citing BillPaymentController's own base
  // guard; MANUAL allocation's narrower PRINCIPAL-tier gate and void's OWNER_ONLY
  // gate are enforced in-page, not at the route level (same as UI-2's OWNER_ONLY
  // delete buttons).
  { prefix: '/finance/bill/payments', roles: ACCOUNTANT_AND_ABOVE, endpoint: 'POST /finance/bill/payments' },
  // UI-5 — corrections (credit notes/refunds/write-offs). Same tier, citing
  // BillCorrectionController's own request-side guard; OWNER_ONLY approve/
  // reject/reverse enforced in-page (same split UI-4's void button uses).
  { prefix: '/finance/bill/corrections', roles: ACCOUNTANT_AND_ABOVE, endpoint: 'POST /finance/corrections/credit-notes' },
  { prefix: '/exams', roles: EXAM_COMMS_TIER, endpoint: 'GET /exams/types' },
  // REP-1 reports — fee aging opens to ACCOUNTANT (GET /reports/finance/aging);
  // the attendance/exam tabs are coordinator-tier and hidden in-page for
  // accountants (backend guard: GET /reports/attendance/trends).
  { prefix: '/reports', roles: [...COORDINATOR_AND_ABOVE, 'ACCOUNTANT'], endpoint: 'GET /reports/finance/aging' },
  { prefix: '/library', roles: LIBRARIAN_AND_ABOVE, endpoint: 'POST /library/books' },
  { prefix: '/settings', roles: SETTINGS_VIEWERS, endpoint: 'GET /settings/profile' },
  { prefix: '/onboarding', roles: COORDINATOR_AND_ABOVE, endpoint: 'onboarding (setup wizard)' },

  // WEB-P Phase 1 — dedicated student/parent/teacher portal landing routes.
  // No backend calls yet from these routes; update the endpoint citation as
  // later phases add real screens.
  { prefix: '/student', roles: ['STUDENT'], endpoint: 'GET /students/me (WEB-P Phase 4)' },
  { prefix: '/parent', roles: ['PARENT'], endpoint: 'GET /students/my-children (WEB-P Phase 5 — real screens now live under this prefix: dashboard, attendance, timetable, notices, results, assignments, fees)' },
  { prefix: '/teacher', roles: ['TEACHER'], endpoint: 'GET /dashboard/weekly-attendance (WEB-P Phase 2 — real screens now live under this prefix: dashboard, attendance, marks, assignments)' },
];

/** Longest-prefix match for a pathname. */
function matchRoute(pathname: string): RouteAccess | null {
  let best: RouteAccess | null = null;
  for (const r of ROUTE_ACCESS) {
    if (pathname === r.prefix || pathname.startsWith(r.prefix + '/')) {
      if (!best || r.prefix.length > best.prefix.length) best = r;
    }
  }
  return best;
}

/**
 * Can `role` access `pathname`? A mapped route is gated by its row — this is how
 * STUDENT/PARENT get access to their own dedicated portal routes (/student,
 * /parent) without being added to the WEB_STAFF_ROLES fallback. An unmapped
 * school route is allowed for any web-staff role (the backend still enforces the
 * real boundary) but denied for STUDENT/PARENT, who should never get default
 * access to an unmapped admin route. PLATFORM_ADMIN is handled separately by the
 * shell (redirected to the super-admin portal), so it is not granted school
 * access here.
 */
export function canAccess(role: Role | null | undefined, pathname: string): boolean {
  if (!role) return false;
  const match = matchRoute(pathname);
  if (match) return match.roles.includes(role);
  return WEB_STAFF_ROLES.includes(role);
}

/**
 * The landing route for a role after login and the "go home" target on the 403
 * screen. Accountant/librarian are excluded from /dashboard (backend denies them),
 * so they get their own home instead of a dashboard whose API calls would 403.
 * STUDENT/PARENT/TEACHER land on their own dedicated portal routes (WEB-P) — note
 * TEACHER's admin access (/dashboard, /attendance, /assignments, etc.) is untouched
 * and still reachable by direct navigation; only the post-login landing changes.
 */
export function homeRoute(role: Role | null | undefined): string {
  if (role === 'ACCOUNTANT') return '/finance';
  if (role === 'LIBRARIAN') return '/library';
  if (role === 'STUDENT') return '/student';
  if (role === 'PARENT') return '/parent';
  if (role === 'TEACHER') return '/teacher';
  return '/dashboard';
}

/** Item shape mirrors the sidebar's NavItem (name + optional path + subItems). */
export type NavLike = { path?: string; subItems?: { path: string }[] };

/**
 * Filters a nav tree to what `role` may see: a leaf is kept if canAccess(path);
 * a group is kept if at least one sub-item is accessible, and its sub-items are
 * filtered the same way. Returns the indices/paths to keep — the sidebar maps
 * this back onto its own item objects.
 */
export function allowedNavItems<T extends NavLike>(role: Role | null | undefined, items: T[]): T[] {
  const out: T[] = [];
  for (const item of items) {
    if (item.subItems && item.subItems.length > 0) {
      const subs = item.subItems.filter((s) => canAccess(role, s.path));
      if (subs.length > 0) out.push({ ...item, subItems: subs });
    } else if (item.path && canAccess(role, item.path)) {
      out.push(item);
    }
  }
  return out;
}
