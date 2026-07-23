import api from '@/lib/api';
import type {
  CreateAssignmentData,
  ReviewSubmissionData,
  UpdateAssignmentData,
} from '@/types/api.types';

export interface AssignmentListParams {
  page?: number;
  limit?: number;
  search?: string;
  classId?: string;
  sectionId?: string;
  subjectId?: string;
  status?: string;
}

export const assignmentsApi = {
  list: (params: AssignmentListParams) => api.get('/assignments', { params }),
  get: (id: string) => api.get(`/assignments/${id}`),
  create: (data: CreateAssignmentData) => api.post('/assignments', data),
  update: (id: string, data: UpdateAssignmentData) => api.patch(`/assignments/${id}`, data),
  remove: (id: string) => api.delete(`/assignments/${id}`),
  publish: (id: string) => api.post(`/assignments/${id}/publish`),
  close: (id: string) => api.post(`/assignments/${id}/close`),
  submissions: (id: string) => api.get(`/assignments/${id}/submissions`),
  review: (id: string, submissionId: string, data: ReviewSubmissionData) =>
    api.patch(`/assignments/${id}/submissions/${submissionId}/review`, data),

  // WEB-P Phase 4 — student-side. listMine hits the /me route (hard-scoped
  // server-side to the caller's own class/section), NOT `list` above (which
  // is the teacher/admin-facing /assignments route with different query
  // semantics and would 403 for STUDENT).
  listMine: (params: { page?: number; limit?: number }) => api.get('/assignments/me', { params }),
  mySubmission: (id: string) => api.get(`/assignments/${id}/submissions/me`),
  presignSubmissionUpload: (id: string, body: { filename: string; contentType: string; size: number }) =>
    api.post(`/assignments/${id}/submissions/presign-upload`, body),
  submitMine: (id: string, data: { textAnswer?: string; fileKey?: string }) =>
    api.post(`/assignments/${id}/submissions`, data),

  // WEB-P Phase 5 — GET /assignments/my-children (PARENT, no id param —
  // returns EVERY child's assignments in one call, already guardian-scoped).
  myChildren: () => api.get('/assignments/my-children'),
};
