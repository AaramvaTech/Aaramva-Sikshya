import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import type {
  AssignmentSubmissionsView,
  ChildAssignments,
  MyAssignment,
  MySubmission,
  TeacherAssignment,
} from '../types';

// ── Student ──────────────────────────────────────────────────────────────────

export function useMyAssignments() {
  return useQuery<MyAssignment[]>({
    queryKey: ['assignments', 'me'],
    // Paginated list → data.data.data (ResponseInterceptor wraps {data, meta}).
    queryFn: async () => {
      const res = await api.get('/assignments/me', { params: { limit: 50 } });
      return res.data.data.data as MyAssignment[];
    },
  });
}

export function useMySubmission(assignmentId: string) {
  return useQuery<MySubmission | null>({
    queryKey: ['assignments', 'me', 'submission', assignmentId],
    queryFn: async () => {
      const res = await api.get(`/assignments/${assignmentId}/submissions/me`);
      return (res.data.data ?? null) as MySubmission | null;
    },
    enabled: !!assignmentId,
  });
}

export function useSubmitAssignment(assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { textAnswer?: string; fileKey?: string }) =>
      api.post(`/assignments/${assignmentId}/submissions`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assignments', 'me'] });
    },
  });
}

// ── Parent ───────────────────────────────────────────────────────────────────

export function useChildrenAssignments() {
  return useQuery<ChildAssignments[]>({
    queryKey: ['assignments', 'my-children'],
    // Simple list → data.data.
    queryFn: async () => {
      const res = await api.get('/assignments/my-children');
      return res.data.data as ChildAssignments[];
    },
  });
}

// ── Teacher ──────────────────────────────────────────────────────────────────

export function useTeacherAssignments(filters: { classId?: string; status?: string }) {
  return useQuery<TeacherAssignment[]>({
    queryKey: ['assignments', 'teacher', filters],
    queryFn: async () => {
      const res = await api.get('/assignments', {
        params: { limit: 50, ...filters },
      });
      return res.data.data.data as TeacherAssignment[];
    },
  });
}

export function useAssignmentSubmissions(assignmentId: string) {
  return useQuery<AssignmentSubmissionsView>({
    queryKey: ['assignments', 'submissions', assignmentId],
    queryFn: async () => {
      const res = await api.get(`/assignments/${assignmentId}/submissions`);
      return res.data.data as AssignmentSubmissionsView;
    },
    enabled: !!assignmentId,
  });
}

export function useReviewSubmission(assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      submissionId,
      marks,
      feedback,
    }: {
      submissionId: string;
      marks?: number;
      feedback?: string;
    }) =>
      api.patch(`/assignments/${assignmentId}/submissions/${submissionId}/review`, {
        ...(marks !== undefined ? { marks } : {}),
        ...(feedback ? { feedback } : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assignments', 'submissions', assignmentId] });
    },
  });
}
