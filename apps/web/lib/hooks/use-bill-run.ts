import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { billRunApi } from '@/lib/api/bill-run.api';
import { useTenantStore } from '@/store/tenant.store';
import type { BillRunStatus, CreateBillRunData, ExcludeBillRunLinesData } from '@/types/api.types';

/** Pulled out as a pure function so the terminal-stop rule is unit-testable
 * without fighting TanStack Query's internal timers — same shape as
 * use-bill-assignment.ts's jobPollInterval. A run stops changing once it's
 * POSTED or VOIDED; DRAFT and POSTING both still need live polling (DRAFT so
 * a second browser tab's exclude shows up, POSTING so the review page can
 * watch the post finish). */
export function billRunPollInterval(status: BillRunStatus | undefined): number | false {
  return status === 'POSTED' || status === 'VOIDED' ? false : 3000;
}

export function useBillRuns(
  params: { page?: number; limit?: number; academicYearId?: string; bsYear?: number; bsMonth?: number; status?: string } = {},
) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['bill-runs', params],
    queryFn: () => billRunApi.list(params).then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useCreateBillRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBillRunData) => billRunApi.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bill-runs'] }),
  });
}

/** Polls every 3s while the run is DRAFT/POSTING — DRAFT so exclude actions
 * from elsewhere show up, POSTING so this doubles as the post-progress view
 * (UI-3-SPEC.md §5.5). Stops once POSTED/VOIDED. `params` scope the LINE
 * table (outcome tab, class filter for WHOLE_SCHOOL runs) — the run header
 * and outcomeSummary are always computed over every line, unfiltered. */
export function useBillRun(
  id: string | null,
  params: { page?: number; limit?: number; outcome?: string; classId?: string } = {},
) {
  return useQuery({
    queryKey: ['bill-run', id, params],
    queryFn: () => billRunApi.get(id as string, params).then((r) => r.data.data),
    enabled: !!id,
    refetchInterval: (query) => billRunPollInterval(query.state.data?.status),
  });
}

export function useExcludeBillRunLines() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ExcludeBillRunLinesData }) => billRunApi.exclude(id, data),
    onSuccess: (_res, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['bill-run', id] });
      queryClient.invalidateQueries({ queryKey: ['bill-runs'] });
    },
  });
}

export function usePostBillRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => billRunApi.post(id),
    onSuccess: (_res, id) => {
      queryClient.invalidateQueries({ queryKey: ['bill-run', id] });
      queryClient.invalidateQueries({ queryKey: ['bill-runs'] });
    },
  });
}

export function useVoidBillRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => billRunApi.void(id),
    onSuccess: (_res, id) => {
      queryClient.invalidateQueries({ queryKey: ['bill-run', id] });
      queryClient.invalidateQueries({ queryKey: ['bill-runs'] });
    },
  });
}
