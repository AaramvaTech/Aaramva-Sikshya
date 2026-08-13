import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { billPaymentApi } from '@/lib/api/bill-payment.api';
import { billInvoiceApi } from '@/lib/api/bill-invoice.api';
import { useTenantStore } from '@/store/tenant.store';
import type { CreateBillPaymentData, UpdateChequeStatusData, VoidPaymentData } from '@/types/api.types';

// ─── Outstanding invoices (UI-4 §2 balance field) ────────────────────────────

export function useStudentOutstandingInvoices(studentId: string | null) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['bill-invoices', { studentId }],
    queryFn: () =>
      billInvoiceApi.list({ studentId: studentId as string, status: 'POSTED', limit: 100 }).then((r) => r.data.data.data),
    enabled: !!slug && !!studentId,
  });
}

export function useStudentBalance(studentId: string | null) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['student-balance', studentId],
    queryFn: () => billPaymentApi.getStudentBalance(studentId as string).then((r) => r.data.data),
    enabled: !!slug && !!studentId,
  });
}

/** UI-5 §3.2 — line-item credit notes. `billInvoiceApi.get` has existed
 * since UI-4 with zero consumers; this is its first hook. */
export function useBillInvoiceDetail(invoiceId: string | null) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['bill-invoice', invoiceId],
    queryFn: () => billInvoiceApi.get(invoiceId as string).then((r) => r.data.data),
    enabled: !!slug && !!invoiceId,
  });
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export function useBillPayments(
  params: {
    page?: number; limit?: number; studentId?: string; method?: string; status?: string;
    dateFrom?: string; dateTo?: string; receivedBy?: string;
  } = {},
) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['bill-payments', params],
    queryFn: () => billPaymentApi.list(params).then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useBillPayment(id: string | null) {
  return useQuery({
    queryKey: ['bill-payment', id],
    queryFn: () => billPaymentApi.get(id as string).then((r) => r.data.data),
    enabled: !!id,
  });
}

export function useRecordPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBillPaymentData) => billPaymentApi.record(data),
    onSuccess: (_res, data) => {
      queryClient.invalidateQueries({ queryKey: ['bill-payments'] });
      queryClient.invalidateQueries({ queryKey: ['bill-invoices', { studentId: data.studentId }] });
      queryClient.invalidateQueries({ queryKey: ['student-balance', data.studentId] });
    },
  });
}

export function useUpdateChequeStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateChequeStatusData }) =>
      billPaymentApi.updateChequeStatus(id, data),
    onSuccess: (_res, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['bill-payments'] });
      queryClient.invalidateQueries({ queryKey: ['bill-payment', id] });
    },
  });
}

export function useVoidPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: VoidPaymentData }) => billPaymentApi.void(id, data),
    onSuccess: (_res, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['bill-payments'] });
      queryClient.invalidateQueries({ queryKey: ['bill-payment', id] });
    },
  });
}

// ─── UI-6 §4.9 — Student Statement ──────────────────────────────────────────

export function useStudentStatement(studentId: string | null, params: { from?: string; to?: string } = {}) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['student-statement', studentId, params],
    queryFn: () => billPaymentApi.getStatement(studentId as string, params).then((r) => r.data.data),
    enabled: !!slug && !!studentId,
  });
}
