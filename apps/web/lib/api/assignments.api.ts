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
};
