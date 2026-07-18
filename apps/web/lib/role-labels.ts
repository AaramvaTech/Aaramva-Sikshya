import type { RoleLabel } from '@/types/api.types';

/** Given the fetched role-labels list, resolve a role string to its display
 *  label. Falls back to the old underscore-replace behavior for any role not
 *  in the editable set (e.g. PLATFORM_ADMIN/STUDENT/PARENT never appear in HR
 *  staff lists, but this keeps the function total). */
export function roleLabelLookup(labels: RoleLabel[] | undefined, role: string): string {
  return labels?.find((l) => l.role === role)?.label ?? role.replace(/_/g, ' ');
}
