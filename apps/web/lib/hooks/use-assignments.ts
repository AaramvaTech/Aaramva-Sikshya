import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assignmentsApi, type AssignmentListParams } from '@/lib/api/assignments.api';
import type {
  Assignment,
  AssignmentSubmissionsView,
  CreateAssignmentData,
  ReviewSubmissionData,
  UpdateAssignmentData,
} from '@/types/api.types';

export function useAssignments(params: AssignmentListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['assignments', params],
    // Paginated list → .data.data.data (ResponseInterceptor wraps {data, meta}).
    queryFn: async () => {
      const res = await assignmentsApi.list(params);
      return {
        data: res.data.data.data as Assignment[],
        meta: res.data.data.meta as { page: number; limit: number; total: number },
      };
    },
    enabled: options?.enabled ?? true,
  });
}

export function useAssignment(id: string) {
  return useQuery({
    queryKey: ['assignments', 'detail', id],
    queryFn: async () => (await assignmentsApi.get(id)).data.data as Assignment,
    enabled: !!id,
  });
}

export function useAssignmentSubmissions(id: string) {
  return useQuery({
    queryKey: ['assignments', 'submissions', id],
    queryFn: async () =>
      (await assignmentsApi.submissions(id)).data.data as AssignmentSubmissionsView,
    enabled: !!id,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: ['assignments'] });
    if (id) void qc.invalidateQueries({ queryKey: ['assignments', 'detail', id] });
  };
}

export function useCreateAssignment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (data: CreateAssignmentData) => assignmentsApi.create(data),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateAssignment(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (data: UpdateAssignmentData) => assignmentsApi.update(id, data),
    onSuccess: () => invalidate(id),
  });
}

export function usePublishAssignment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => assignmentsApi.publish(id),
    onSuccess: (_res, id) => invalidate(id),
  });
}

export function useCloseAssignment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => assignmentsApi.close(id),
    onSuccess: (_res, id) => invalidate(id),
  });
}

export function useDeleteAssignment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => assignmentsApi.remove(id),
    onSuccess: () => invalidate(),
  });
}

export function useReviewSubmission(assignmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, data }: { submissionId: string; data: ReviewSubmissionData }) =>
      assignmentsApi.review(assignmentId, submissionId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assignments', 'submissions', assignmentId] });
    },
  });
}
