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

  getUploadUrl: (
    id: string,
    data: { fileName: string; documentType: string; contentType: string },
  ) =>
    api.post<ApiResponse<{ presignedUrl: string; fileUrl: string }>>(
      `/students/${id}/documents/presign`,
      data,
    ),

  confirmUpload: (
    id: string,
    data: { fileUrl: string; fileName: string; documentType: string },
  ) => api.post(`/students/${id}/documents/confirm`, data),

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
    api.post<ApiResponse<{ userId: string; email: string; sent: true }>>(
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
    api.post<ApiResponse<{ email: string; sent: true }>>(
      `/students/${studentId}/guardians/${guardianId}/account/resend`,
    ),
};
