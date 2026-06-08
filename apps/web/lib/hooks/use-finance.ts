import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { financeApi } from '@/lib/api/finance.api';
import { useTenantStore } from '@/store/tenant.store';
import type {
  InvoiceListParams,
  CreateFeeStructureData,
  CreateFeeCategoryData,
  RecordPaymentData,
  GenerateInvoiceData,
  GenerateBulkInvoiceData,
} from '@/types/api.types';

export function useFeeCategories() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['finance', 'fee-categories'],
    queryFn: () => financeApi.listCategories().then((r) => r.data.data.data),
    enabled: !!slug,
  });
}

export function useFeeStructures(academicYearId?: string) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['finance', 'fee-structures', academicYearId],
    queryFn: () => financeApi.listStructures({ academicYearId }).then((r) => r.data.data.data),
    enabled: !!slug,
  });
}

export function useFeeStructure(id: string) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['finance', 'fee-structure', id],
    queryFn: () => financeApi.getStructure(id).then((r) => r.data.data),
    enabled: !!slug && !!id,
  });
}

export function useCreateFeeStructure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateFeeStructureData) => financeApi.createStructure(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'fee-structures'] });
    },
  });
}

export function useCreateFeeCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateFeeCategoryData) => financeApi.createCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'fee-categories'] });
    },
  });
}

export function useInvoices(params: InvoiceListParams) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['invoices', params],
    queryFn: () => financeApi.listInvoices(params).then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useInvoice(id: string) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['invoice', id],
    queryFn: () => financeApi.getInvoice(id).then((r) => r.data.data),
    enabled: !!slug && !!id,
  });
}

export function useGenerateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: GenerateInvoiceData) => financeApi.generateInvoice(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useGenerateBulkInvoices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: GenerateBulkInvoiceData) => financeApi.generateBulkInvoices(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useVoidInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => financeApi.voidInvoice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['finance', 'collection-report'] });
    },
  });
}

export function useRecordPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: RecordPaymentData) => financeApi.recordPayment(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoice', variables.invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['finance', 'collection-report'] });
    },
  });
}

export function useCollectionReport(academicYearId: string) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['finance', 'collection-report', academicYearId],
    queryFn: () =>
      financeApi.getCollectionReport({ academicYearId }).then((r) => r.data.data),
    enabled: !!slug && !!academicYearId,
  });
}

export function useDefaulters(academicYearId: string) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['finance', 'defaulters', academicYearId],
    queryFn: () =>
      financeApi.getDefaulters({ academicYearId }).then((r) => r.data.data),
    enabled: !!slug && !!academicYearId,
  });
}

export function useStudentLedger(studentId: string, academicYearId: string) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['finance', 'ledger', studentId, academicYearId],
    queryFn: () =>
      financeApi.getStudentLedger(studentId, { academicYearId }).then((r) => r.data.data),
    enabled: !!slug && !!studentId && !!academicYearId,
  });
}
