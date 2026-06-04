/**
 * RBAC roles, in order of privilege (highest first).
 * Stored as strings in tenant_<slug>.users.role.
 */
export enum Role {
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  SCHOOL_OWNER = 'SCHOOL_OWNER',
  PRINCIPAL = 'PRINCIPAL',
  ACADEMIC_COORDINATOR = 'ACADEMIC_COORDINATOR',
  ACCOUNTANT = 'ACCOUNTANT',
  LIBRARIAN = 'LIBRARIAN',
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT',
  PARENT = 'PARENT',
}
