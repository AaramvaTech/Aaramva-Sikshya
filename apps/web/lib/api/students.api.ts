import api from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  StudentSummary,
  StudentDetail,
  StudentDocument,
  Enrollment,
  CreateStudentData,
  EnrollStudentData,
} from '@/types/api.types';

export const studentsApi = {
  list: (params: {
    page?: number;
    limit?: number;
    search?: string;
    classId?: string;
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
};
