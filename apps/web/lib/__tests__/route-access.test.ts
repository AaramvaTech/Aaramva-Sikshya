import { describe, it, expect } from 'vitest';
import type { Role } from '@/types/api.types';
import { ROUTE_ACCESS, WEB_STAFF_ROLES, canAccess, homeRoute } from '../route-access';

// The nine RBAC roles (mirrors apps/web/types/api.types.ts `Role` — there is no
// exported "all roles" array in the codebase to import instead).
const ALL_ROLES: Role[] = [
  'PLATFORM_ADMIN',
  'SCHOOL_OWNER',
  'PRINCIPAL',
  'ACADEMIC_COORDINATOR',
  'ACCOUNTANT',
  'LIBRARIAN',
  'TEACHER',
  'STUDENT',
  'PARENT',
];

describe('ROUTE_ACCESS rows — zero regression (parametrized over the live array)', () => {
  for (const row of ROUTE_ACCESS) {
    describe(`row ${row.prefix} (${row.endpoint})`, () => {
      for (const role of row.roles) {
        it(`allows ${role}`, () => {
          expect(canAccess(role, row.prefix)).toBe(true);
        });
      }
      for (const role of ALL_ROLES.filter((r) => !row.roles.includes(r))) {
        it(`denies ${role}`, () => {
          expect(canAccess(role, row.prefix)).toBe(false);
        });
      }
    });
  }
});

describe('canAccess — unmapped-route fallback', () => {
  const unmapped = '/some-future-page';

  for (const role of WEB_STAFF_ROLES) {
    it(`allows ${role} (WEB_STAFF_ROLES)`, () => {
      expect(canAccess(role, unmapped)).toBe(true);
    });
  }

  for (const role of ['STUDENT', 'PARENT', 'PLATFORM_ADMIN'] as Role[]) {
    it(`denies ${role}`, () => {
      expect(canAccess(role, unmapped)).toBe(false);
    });
  }
});

describe('canAccess — WEB-P student/parent/teacher portal rows are cross-exclusive', () => {
  it('STUDENT can access /student and nested paths', () => {
    expect(canAccess('STUDENT', '/student')).toBe(true);
    expect(canAccess('STUDENT', '/student/anything')).toBe(true);
  });

  it('STUDENT cannot access /parent, /teacher, or existing admin prefixes', () => {
    expect(canAccess('STUDENT', '/parent')).toBe(false);
    expect(canAccess('STUDENT', '/teacher')).toBe(false);
    expect(canAccess('STUDENT', '/dashboard')).toBe(false);
    expect(canAccess('STUDENT', '/finance')).toBe(false);
  });

  it('PARENT can access /parent and nested paths', () => {
    expect(canAccess('PARENT', '/parent')).toBe(true);
    expect(canAccess('PARENT', '/parent/anything')).toBe(true);
  });

  it('PARENT cannot access /student, /teacher, or existing admin prefixes', () => {
    expect(canAccess('PARENT', '/student')).toBe(false);
    expect(canAccess('PARENT', '/teacher')).toBe(false);
    expect(canAccess('PARENT', '/dashboard')).toBe(false);
    expect(canAccess('PARENT', '/finance')).toBe(false);
  });

  it('TEACHER can access /teacher and nested paths', () => {
    expect(canAccess('TEACHER', '/teacher')).toBe(true);
    expect(canAccess('TEACHER', '/teacher/anything')).toBe(true);
  });

  it('TEACHER cannot access /student or /parent', () => {
    expect(canAccess('TEACHER', '/student')).toBe(false);
    expect(canAccess('TEACHER', '/parent')).toBe(false);
  });

  it('TEACHER retains its existing admin access (unrelated to this task, must stay true)', () => {
    expect(canAccess('TEACHER', '/dashboard')).toBe(true);
    expect(canAccess('TEACHER', '/attendance')).toBe(true);
    expect(canAccess('TEACHER', '/assignments')).toBe(true);
  });
});

describe('homeRoute', () => {
  it('STUDENT -> /student', () => {
    expect(homeRoute('STUDENT')).toBe('/student');
  });

  it('PARENT -> /parent', () => {
    expect(homeRoute('PARENT')).toBe('/parent');
  });

  it('TEACHER -> /teacher', () => {
    expect(homeRoute('TEACHER')).toBe('/teacher');
  });

  it('ACCOUNTANT -> /finance', () => {
    expect(homeRoute('ACCOUNTANT')).toBe('/finance');
  });

  it('LIBRARIAN -> /library', () => {
    expect(homeRoute('LIBRARIAN')).toBe('/library');
  });

  it('SCHOOL_OWNER -> /dashboard (unaffected fallthrough)', () => {
    expect(homeRoute('SCHOOL_OWNER')).toBe('/dashboard');
  });

  it('PRINCIPAL -> /dashboard (unaffected fallthrough)', () => {
    expect(homeRoute('PRINCIPAL')).toBe('/dashboard');
  });

  it('ACADEMIC_COORDINATOR -> /dashboard (unaffected fallthrough)', () => {
    expect(homeRoute('ACADEMIC_COORDINATOR')).toBe('/dashboard');
  });

  it('null -> /dashboard (unaffected fallthrough)', () => {
    expect(homeRoute(null)).toBe('/dashboard');
  });
});
