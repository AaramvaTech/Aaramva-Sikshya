import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { billCorrectionApi, financeSettingsApi } from '@/lib/api/bill-correction.api';
import { useTenantStore } from '@/store/tenant.store';
import type {
  CreateCreditNoteData, CreateRefundData, CreateWriteOffData, DecideCorrectionData,
} from '@/types/api.types';

// ─── Reads ──────────────────────────────────────────────────────────────────

export function useBillCorrections(
  params: { page?: number; limit?: number; studentId?: string; type?: string; status?: string } = {},
) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['bill-corrections', params],
    queryFn: () => billCorrectionApi.list(params).then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useBillCorrection(id: string | null) {
  return useQuery({
    queryKey: ['bill-correction', id],
    queryFn: () => billCorrectionApi.get(id as string).then((r) => r.data.data),
    enabled: !!id,
  });
}

/** UI-5 ruling 1 — read-only threshold, feeds the New Correction cap preview. */
export function useFinanceSettings() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['finance-settings'],
    queryFn: () => financeSettingsApi.get().then((r) => r.data.data),
    enabled: !!slug,
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────────
// Corrections move the same balances payments do — same invalidation shape
// useRecordPayment already uses (use-bill-payment.ts).

function invalidateForStudent(queryClient: ReturnType<typeof useQueryClient>, studentId: string) {
  queryClient.invalidateQueries({ queryKey: ['bill-corrections'] });
  queryClient.invalidateQueries({ queryKey: ['bill-invoices', { studentId }] });
  queryClient.invalidateQueries({ queryKey: ['student-balance', studentId] });
}

export function useRequestCreditNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCreditNoteData) => billCorrectionApi.requestCreditNote(data),
    onSuccess: (_res, data) => invalidateForStudent(queryClient, data.studentId),
  });
}

export function useRequestRefund() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRefundData) => billCorrectionApi.requestRefund(data),
    onSuccess: (_res, data) => invalidateForStudent(queryClient, data.studentId),
  });
}

export function useRequestWriteOff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateWriteOffData) => billCorrectionApi.requestWriteOff(data),
    onSuccess: (_res, data) => invalidateForStudent(queryClient, data.studentId),
  });
}

export function useApproveCorrection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: DecideCorrectionData }) => billCorrectionApi.approve(id, data),
    onSuccess: (res, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['bill-correction', id] });
      invalidateForStudent(queryClient, res.data.data.studentId);
    },
  });
}

export function useRejectCorrection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: DecideCorrectionData }) => billCorrectionApi.reject(id, data),
    onSuccess: (_res, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['bill-correction', id] });
      queryClient.invalidateQueries({ queryKey: ['bill-corrections'] });
    },
  });
}

export function useReverseCorrection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => billCorrectionApi.reverse(id),
    onSuccess: (res, id) => {
      queryClient.invalidateQueries({ queryKey: ['bill-correction', id] });
      invalidateForStudent(queryClient, res.data.data.studentId);
    },
  });
}
