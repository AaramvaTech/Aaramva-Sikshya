import api from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  StudentSummary,
  StudentDetail,
  StudentDocument,
  StudentStats,
  Enrollment,
  CreateStudentData,
  EnrollStudentData,
  ImportPreviewResult,
  ImportCommitResult,
  MyChild,
} from '@/types/api.types';

export const studentsApi = {
  getStats: () =>
    api.get<ApiResponse<StudentStats>>('/students/stats'),

  // ── CSV import (OB2) ──────────────────────────────────────────────────────
  importTemplate: () =>
    api.get<string>('/students/import/template', { responseType: 'text' }),
  importPreview: (csv: string) =>
    api.post<ApiResponse<ImportPreviewResult>>('/students/import/preview', { csv }),
  importCommit: (csv: string) =>
    api.post<ApiResponse<ImportCommitResult>>('/students/import/commit', { csv }),

  list: (params: {
    page?: number;
    limit?: number;
    search?: string;
    classId?: string;
    className?: string;
    sectionId?: string;
    status?: string;
  }) =>
    api.get<ApiResponse<PaginatedResponse<StudentSummary>>>('/students', { params }),

  getById: (id: string) =>
    api.get<ApiResponse<StudentDetail>>(`/students/${id}`),

  create: (data: CreateStudentData) =>
    api.post<ApiResponse<StudentDetail>>('/students', data),

  update: (id: string, data: Partial<CreateStudentData>) =>
    api.patch<ApiResponse<StudentDetail>>(`/students/${id}`, data),

  delete: (id: string) => api.delete(`/students/${id}`),

  enroll: (id: string, data: EnrollStudentData) =>
    api.post<ApiResponse<Enrollment>>(`/students/${id}/enroll`, data),

  // STUDENT-DOCS-1: presign+PUT goes through the shared uploadFile() helper
  // (kind 'student-document', same as student-photo/staff-document) — this is
  // the confirm/persist step, mirroring hrApi.addStaffDocument's shape exactly.
  addDocument: (
    id: string,
    data: { documentType: string; fileKey: string; fileName?: string },
  ) => api.post<ApiResponse<StudentDocument>>(`/students/${id}/documents/confirm`, data),

  getDocuments: (id: string) =>
    api.get<ApiResponse<StudentDocument[]>>(`/students/${id}/documents`),

  // ── Login accounts (REG-1): create + email credentials (no password sent →
  // backend generates a temp password + emails it; forced change on first login).
  createAccount: (id: string, data: { email: string }) =>
    api.post<ApiResponse<{ userId: string; email: string; linked: true }>>(
      `/students/${id}/account`,
      data,
    ),
  resendAccount: (id: string) =>
    api.post<ApiResponse<{ userId: string; deliveryIds: string[] }>>(
      `/students/${id}/account/resend`,
    ),
  createGuardianAccount: (studentId: string, guardianId: string, data: { email: string }) =>
    api.post<
      ApiResponse<{
        userId: string;
        guardianId: string;
        email: string;
        linked: true;
        // false when an existing PARENT account was reused (then no email is sent).
        createdNewUser: boolean;
        enqueued: boolean;
      }>
    >(`/students/${studentId}/guardians/${guardianId}/account`, data),
  resendGuardianAccount: (studentId: string, guardianId: string) =>
    api.post<ApiResponse<{ userId: string; deliveryIds: string[] }>>(
      `/students/${studentId}/guardians/${guardianId}/account/resend`,
    ),

  // CL Phase 1: severs this one guardian-student link (soft delete). Does not
  // touch the guardian's own login — see GuardianService.removeGuardian.
  removeGuardian: (studentId: string, guardianId: string) =>
    api.delete<ApiResponse<{ id: string; studentId: string; removedAt: string }>>(
      `/students/${studentId}/guardians/${guardianId}`,
    ),

  // WEB-P Phase 5 — GET /students/my-children (PARENT role only, no id param
  // — scoped server-side via the guardians table on the caller's own token).
  getMyChildren: () => api.get<ApiResponse<MyChild[]>>('/students/my-children'),
};
