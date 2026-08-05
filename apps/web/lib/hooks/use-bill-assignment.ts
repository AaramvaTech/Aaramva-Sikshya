import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { billAssignmentApi } from '@/lib/api/bill-assignment.api';
import { useTenantStore } from '@/store/tenant.store';
import type {
  AssignFeeStructureData,
  BulkAssignData,
  BulkAssignJobStatus,
  CreateStudentFeeOverrideData, UpdateStudentFeeOverrideData,
  CreateStudentConcessionData, UpdateStudentConcessionData,
  CreateStudentTransportAssignmentData, UpdateStudentTransportAssignmentData,
} from '@/types/api.types';

/** Pulled out as a pure function so the terminal-stop rule is unit-testable
 * without fighting TanStack Query's internal timers (see
 * __tests__/use-bill-assignment.test.tsx). */
export function jobPollInterval(status: BulkAssignJobStatus | undefined): number | false {
  return status === 'COMPLETED' || status === 'FAILED' ? false : 3000;
}

/**
 * UI-2 — hooks for the BILL-2 assignment surface. Mutation hooks here only
 * invalidate their OWN resource list. The fee-preview panel is watching four
 * sibling panels' writes, which is a UI-composition concern, not a data-layer
 * one — the consuming component (student-billing-tab.tsx) does the extra
 * `invalidateQueries(['fee-preview', studentId])` itself, same call site
 * pattern already used to fix the WEB-P Phase 3 leave-apply staleness bug
 * (CLAUDE.md: "fixed at the page level ... deliberately leaving the shared
 * hook untouched").
 */

// ─── Fee Structure Assignment ────────────────────────────────────────────────

export function useStudentFeeStructureAssignments(studentId: string, academicYearId?: string) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['fee-structure-assignments', studentId, academicYearId],
    queryFn: () =>
      billAssignmentApi.feeStructureAssignment.listForStudent(studentId, academicYearId).then((r) => r.data.data),
    enabled: !!slug && !!studentId,
  });
}

export function useAssignFeeStructure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, data }: { studentId: string; data: AssignFeeStructureData }) =>
      billAssignmentApi.feeStructureAssignment.assign(studentId, data),
    onSuccess: (_res, { studentId }) =>
      queryClient.invalidateQueries({ queryKey: ['fee-structure-assignments', studentId] }),
  });
}

// ─── Bulk Assign ──────────────────────────────────────────────────────────────

export function useBulkAssign() {
  return useMutation({
    mutationFn: ({ feeStructureId, data }: { feeStructureId: string; data: BulkAssignData }) =>
      billAssignmentApi.bulkAssign.create(feeStructureId, data),
  });
}

/** Polls every 3s (server drains PENDING/RUNNING jobs every 10s — see
 * UI-2-SPEC.md §1/§5.2) until the job reaches a terminal status. */
export function useBulkAssignJob(jobId: string | null) {
  return useQuery({
    queryKey: ['bulk-assign-job', jobId],
    queryFn: () => billAssignmentApi.bulkAssign.getJob(jobId as string).then((r) => r.data.data),
    enabled: !!jobId,
    refetchInterval: (query) => jobPollInterval(query.state.data?.status),
  });
}

// ─── Fee Overrides ────────────────────────────────────────────────────────────

export function useFeeOverrides(params: { studentId?: string; academicYearId?: string } = {}) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['fee-overrides', params],
    queryFn: () => billAssignmentApi.feeOverrides.list(params).then((r) => r.data.data.data),
    enabled: !!slug && !!params.studentId,
  });
}
export function useCreateFeeOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateStudentFeeOverrideData) => billAssignmentApi.feeOverrides.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fee-overrides'] }),
  });
}
export function useUpdateFeeOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateStudentFeeOverrideData }) =>
      billAssignmentApi.feeOverrides.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fee-overrides'] }),
  });
}
export function useDeleteFeeOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => billAssignmentApi.feeOverrides.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fee-overrides'] }),
  });
}

// ─── Concessions ──────────────────────────────────────────────────────────────

export function useStudentConcessions(params: { studentId?: string; academicYearId?: string } = {}) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['concessions', params],
    queryFn: () => billAssignmentApi.concessions.list(params).then((r) => r.data.data.data),
    enabled: !!slug && !!params.studentId,
  });
}
export function useCreateConcession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateStudentConcessionData) => billAssignmentApi.concessions.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['concessions'] }),
  });
}
export function useUpdateConcession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateStudentConcessionData }) =>
      billAssignmentApi.concessions.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['concessions'] }),
  });
}
export function useDeleteConcession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => billAssignmentApi.concessions.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['concessions'] }),
  });
}

// ─── Transport Assignments ────────────────────────────────────────────────────

export function useStudentTransportAssignments(studentId: string) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['transport-assignments', { studentId }],
    queryFn: () => billAssignmentApi.transportAssignments.list({ studentId }).then((r) => r.data.data.data),
    enabled: !!slug && !!studentId,
  });
}
export function useCreateTransportAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateStudentTransportAssignmentData) => billAssignmentApi.transportAssignments.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transport-assignments'] }),
  });
}
export function useUpdateTransportAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateStudentTransportAssignmentData }) =>
      billAssignmentApi.transportAssignments.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transport-assignments'] }),
  });
}
export function useDeleteTransportAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => billAssignmentApi.transportAssignments.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transport-assignments'] }),
  });
}

// ─── Fee Preview ──────────────────────────────────────────────────────────────

export function useFeePreview(studentId: string, academicYearId: string, asOfDate?: string) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['fee-preview', studentId, academicYearId, asOfDate],
    queryFn: () =>
      billAssignmentApi.feePreview.get(studentId, { academicYearId, asOfDate }).then((r) => r.data.data),
    enabled: !!slug && !!studentId && !!academicYearId,
    retry: false,
  });
}
