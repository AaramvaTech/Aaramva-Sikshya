import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { billCatalogApi } from '@/lib/api/bill-catalog.api';
import { useTenantStore } from '@/store/tenant.store';
import type {
  CreateFeeHeadData, UpdateFeeHeadData,
  CreateDiscountReasonData, UpdateDiscountReasonData,
  CreateCorrectionReasonData, UpdateCorrectionReasonData,
  CreateTransportRouteData, UpdateTransportRouteData,
  CreateTaxRateData, UpdateTaxRateData,
  CreateLateFeeRuleData, UpdateLateFeeRuleData,
  CreateBillFeeStructureData, UpdateBillFeeStructureItemsData,
} from '@/types/api.types';

// ─── Fee Heads ────────────────────────────────────────────────────────────────

export function useFeeHeads() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['fee-heads'],
    queryFn: () => billCatalogApi.feeHeads.list().then((r) => r.data.data.data),
    enabled: !!slug,
  });
}
export function useCreateFeeHead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateFeeHeadData) => billCatalogApi.feeHeads.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fee-heads'] }),
  });
}
export function useUpdateFeeHead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateFeeHeadData }) => billCatalogApi.feeHeads.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fee-heads'] }),
  });
}
export function useDeleteFeeHead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => billCatalogApi.feeHeads.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fee-heads'] }),
  });
}

// ─── Discount Reasons ───────────────────────────────────────────────────────

export function useDiscountReasons() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['discount-reasons'],
    queryFn: () => billCatalogApi.discountReasons.list().then((r) => r.data.data.data),
    enabled: !!slug,
  });
}
export function useCreateDiscountReason() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDiscountReasonData) => billCatalogApi.discountReasons.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['discount-reasons'] }),
  });
}
export function useUpdateDiscountReason() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDiscountReasonData }) => billCatalogApi.discountReasons.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['discount-reasons'] }),
  });
}
export function useDeleteDiscountReason() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => billCatalogApi.discountReasons.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['discount-reasons'] }),
  });
}

// ─── Correction Reasons ─────────────────────────────────────────────────────

export function useCorrectionReasons() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['correction-reasons'],
    queryFn: () => billCatalogApi.correctionReasons.list().then((r) => r.data.data.data),
    enabled: !!slug,
  });
}
export function useCreateCorrectionReason() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCorrectionReasonData) => billCatalogApi.correctionReasons.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['correction-reasons'] }),
  });
}
export function useUpdateCorrectionReason() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCorrectionReasonData }) => billCatalogApi.correctionReasons.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['correction-reasons'] }),
  });
}
export function useDeleteCorrectionReason() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => billCatalogApi.correctionReasons.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['correction-reasons'] }),
  });
}

// ─── Transport Routes ───────────────────────────────────────────────────────

export function useTransportRoutes() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['transport-routes'],
    queryFn: () => billCatalogApi.transportRoutes.list().then((r) => r.data.data.data),
    enabled: !!slug,
  });
}
export function useCreateTransportRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTransportRouteData) => billCatalogApi.transportRoutes.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transport-routes'] }),
  });
}
export function useUpdateTransportRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTransportRouteData }) => billCatalogApi.transportRoutes.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transport-routes'] }),
  });
}
export function useDeleteTransportRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => billCatalogApi.transportRoutes.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transport-routes'] }),
  });
}

// ─── Tax Rates ──────────────────────────────────────────────────────────────

export function useTaxRates() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['tax-rates'],
    queryFn: () => billCatalogApi.taxRates.list().then((r) => r.data.data.data),
    enabled: !!slug,
  });
}
export function useCreateTaxRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTaxRateData) => billCatalogApi.taxRates.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tax-rates'] }),
  });
}
export function useUpdateTaxRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaxRateData }) => billCatalogApi.taxRates.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tax-rates'] }),
  });
}
export function useDeleteTaxRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => billCatalogApi.taxRates.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tax-rates'] }),
  });
}

// ─── Late Fee Rules ─────────────────────────────────────────────────────────

export function useLateFeeRules() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['late-fee-rules'],
    queryFn: () => billCatalogApi.lateFeeRules.list().then((r) => r.data.data.data),
    enabled: !!slug,
  });
}
export function useCreateLateFeeRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateLateFeeRuleData) => billCatalogApi.lateFeeRules.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['late-fee-rules'] }),
  });
}
export function useUpdateLateFeeRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateLateFeeRuleData }) => billCatalogApi.lateFeeRules.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['late-fee-rules'] }),
  });
}
export function useDeleteLateFeeRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => billCatalogApi.lateFeeRules.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['late-fee-rules'] }),
  });
}

// ─── Fee Structures ─────────────────────────────────────────────────────────

export function useFeeStructures(params: { academicYearId?: string; classId?: string } = {}) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['fee-structures', params],
    queryFn: () => billCatalogApi.feeStructures.list(params).then((r) => r.data.data),
    enabled: !!slug,
  });
}
export function useFeeStructure(id: string, options?: { enabled?: boolean }) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['fee-structure', id],
    queryFn: () => billCatalogApi.feeStructures.get(id).then((r) => r.data.data),
    enabled: !!slug && !!id && (options?.enabled ?? true),
  });
}
export function useCreateFeeStructure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBillFeeStructureData) => billCatalogApi.feeStructures.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fee-structures'] }),
  });
}
export function useUpdateFeeStructureItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBillFeeStructureItemsData }) =>
      billCatalogApi.feeStructures.updateItems(id, data),
    onSuccess: (_res, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['fee-structures'] });
      queryClient.invalidateQueries({ queryKey: ['fee-structure', id] });
    },
  });
}
export function useDeleteFeeStructure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => billCatalogApi.feeStructures.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fee-structures'] }),
  });
}
