import { describe, it, expect } from 'vitest';
import { canUploadStudentDocuments, STUDENT_DOCUMENT_UPLOAD_ROLES } from '../student-document-access';
import type { Role } from '@/types/api.types';

// STUDENT-DOCS-1 Phase 1's locked access model: upload is admin/staff-only
// (matching PATCH /students/:id) — TEACHER/ACCOUNTANT/LIBRARIAN can view a
// student's profile but not upload documents; STUDENT/PARENT never upload.
describe('canUploadStudentDocuments', () => {
  it.each(STUDENT_DOCUMENT_UPLOAD_ROLES)('allows %s', (role) => {
    expect(canUploadStudentDocuments(role)).toBe(true);
  });

  it.each(['TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'STUDENT', 'PARENT'] satisfies Role[])('denies %s', (role) => {
    expect(canUploadStudentDocuments(role)).toBe(false);
  });

  it('denies a null/undefined role (not-yet-hydrated session)', () => {
    expect(canUploadStudentDocuments(null)).toBe(false);
    expect(canUploadStudentDocuments(undefined)).toBe(false);
  });
});
