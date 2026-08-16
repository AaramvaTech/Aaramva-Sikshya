import type { Role } from '@/types/api.types';

/** STUDENT-DOCS-1 — matches the API's STUDENT_PROFILE_EDITORS exactly
 * (storage.policy.ts / student.controller.ts), which itself matches
 * PATCH /students/:id's role list (student profile editing). Pulled out
 * as its own predicate the same way billing-tab-access.ts was, so the
 * claim is unit-tested rather than just a visual hide. */
export const STUDENT_DOCUMENT_UPLOAD_ROLES: Role[] = ['SCHOOL_OWNER', 'PRINCIPAL', 'ACADEMIC_COORDINATOR'];

export function canUploadStudentDocuments(role: Role | null | undefined): boolean {
  return !!role && STUDENT_DOCUMENT_UPLOAD_ROLES.includes(role);
}
