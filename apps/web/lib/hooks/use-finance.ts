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
  SetAssignmentData,
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

export function useUpdateFeeCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateFeeCategoryData> }) =>
      financeApi.updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'fee-categories'] });
    },
  });
}

export function useDeleteFeeCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => financeApi.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'fee-categories'] });
    },
  });
}

export function useUpdateFeeStructureItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, items }: { id: string; items: CreateFeeStructureData['items'] }) =>
      financeApi.updateStructureItems(id, { items }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'fee-structure', id] });
      queryClient.invalidateQueries({ queryKey: ['finance', 'fee-structures'] });
    },
  });
}

export function useDeleteFeeStructure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => financeApi.deleteStructure(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'fee-structures'] });
    },
  });
}

export function useStudentAssignments(studentId: string, academicYearId?: string) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['finance', 'student-assignments', studentId, academicYearId],
    queryFn: () =>
      financeApi.getStudentAssignments(studentId, academicYearId).then((r) => r.data.data),
    enabled: !!slug && !!studentId,
  });
}

export function useSetStudentAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, data }: { studentId: string; data: SetAssignmentData }) =>
      financeApi.setStudentAssignment(studentId, data),
    onSuccess: (_, { studentId }) => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'student-assignments', studentId] });
    },
  });
}

export function useCancelPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => financeApi.cancelPayment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice'] });
      queryClient.invalidateQueries({ queryKey: ['finance', 'collection-report'] });
    },
  });
}

export function useRecalculateFine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => financeApi.recalculateFine(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
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
    // POL-1 T5: the endpoint returns a DefaulterReport ({ students, totals… }),
    // but every consumer treats this as the student array (.map/.length/.slice).
    // Unwrap .students here so the shape matches — the old code returned the whole
    // object, so the defaulters tab AND the finance overview threw on any tenant
    // that actually had defaulters.
    queryFn: () =>
      financeApi.getDefaulters({ academicYearId }).then((r) => r.data.data.students),
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
