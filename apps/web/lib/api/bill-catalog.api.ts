import api from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  FeeHead,
  CreateFeeHeadData,
  UpdateFeeHeadData,
  DiscountReason,
  CreateDiscountReasonData,
  UpdateDiscountReasonData,
  CorrectionReason,
  CreateCorrectionReasonData,
  UpdateCorrectionReasonData,
  TransportRoute,
  CreateTransportRouteData,
  UpdateTransportRouteData,
  TaxRate,
  CreateTaxRateData,
  UpdateTaxRateData,
  LateFeeRule,
  CreateLateFeeRuleData,
  UpdateLateFeeRuleData,
  BillFeeStructure,
  CreateBillFeeStructureData,
  UpdateBillFeeStructureItemsData,
} from '@/types/api.types';

/** UI-1 — one client module for all seven fee-catalog sub-resources, grouped
 * to mirror BillCatalogController's own section order on the backend. */
export const billCatalogApi = {
  feeHeads: {
    list: () => api.get<ApiResponse<PaginatedResponse<FeeHead>>>('/finance/fee-heads', { params: { limit: 100 } }),
    create: (data: CreateFeeHeadData) => api.post<ApiResponse<FeeHead>>('/finance/fee-heads', data),
    update: (id: string, data: UpdateFeeHeadData) => api.patch<ApiResponse<FeeHead>>(`/finance/fee-heads/${id}`, data),
    delete: (id: string) => api.delete(`/finance/fee-heads/${id}`),
  },

  discountReasons: {
    list: () => api.get<ApiResponse<PaginatedResponse<DiscountReason>>>('/finance/discount-reasons', { params: { limit: 100 } }),
    create: (data: CreateDiscountReasonData) => api.post<ApiResponse<DiscountReason>>('/finance/discount-reasons', data),
    update: (id: string, data: UpdateDiscountReasonData) =>
      api.patch<ApiResponse<DiscountReason>>(`/finance/discount-reasons/${id}`, data),
    delete: (id: string) => api.delete(`/finance/discount-reasons/${id}`),
  },

  correctionReasons: {
    list: () => api.get<ApiResponse<PaginatedResponse<CorrectionReason>>>('/finance/correction-reasons', { params: { limit: 100 } }),
    create: (data: CreateCorrectionReasonData) => api.post<ApiResponse<CorrectionReason>>('/finance/correction-reasons', data),
    update: (id: string, data: UpdateCorrectionReasonData) =>
      api.patch<ApiResponse<CorrectionReason>>(`/finance/correction-reasons/${id}`, data),
    delete: (id: string) => api.delete(`/finance/correction-reasons/${id}`),
  },

  transportRoutes: {
    list: () => api.get<ApiResponse<PaginatedResponse<TransportRoute>>>('/finance/transport-routes', { params: { limit: 100 } }),
    create: (data: CreateTransportRouteData) => api.post<ApiResponse<TransportRoute>>('/finance/transport-routes', data),
    update: (id: string, data: UpdateTransportRouteData) =>
      api.patch<ApiResponse<TransportRoute>>(`/finance/transport-routes/${id}`, data),
    delete: (id: string) => api.delete(`/finance/transport-routes/${id}`),
  },

  taxRates: {
    list: () => api.get<ApiResponse<PaginatedResponse<TaxRate>>>('/finance/tax-rates', { params: { limit: 100 } }),
    create: (data: CreateTaxRateData) => api.post<ApiResponse<TaxRate>>('/finance/tax-rates', data),
    update: (id: string, data: UpdateTaxRateData) => api.patch<ApiResponse<TaxRate>>(`/finance/tax-rates/${id}`, data),
    delete: (id: string) => api.delete(`/finance/tax-rates/${id}`),
  },

  lateFeeRules: {
    list: () => api.get<ApiResponse<PaginatedResponse<LateFeeRule>>>('/finance/late-fee-rules', { params: { limit: 100 } }),
    create: (data: CreateLateFeeRuleData) => api.post<ApiResponse<LateFeeRule>>('/finance/late-fee-rules', data),
    update: (id: string, data: UpdateLateFeeRuleData) => api.patch<ApiResponse<LateFeeRule>>(`/finance/late-fee-rules/${id}`, data),
    delete: (id: string) => api.delete(`/finance/late-fee-rules/${id}`),
  },

  feeStructures: {
    list: (params: { academicYearId?: string; classId?: string; page?: number; limit?: number } = {}) =>
      api.get<ApiResponse<PaginatedResponse<BillFeeStructure>>>('/finance/bill/fee-structures', { params: { limit: 100, ...params } }),
    get: (id: string) => api.get<ApiResponse<BillFeeStructure>>(`/finance/bill/fee-structures/${id}`),
    create: (data: CreateBillFeeStructureData) => api.post<ApiResponse<BillFeeStructure>>('/finance/bill/fee-structures', data),
    updateItems: (id: string, data: UpdateBillFeeStructureItemsData) =>
      api.patch<ApiResponse<BillFeeStructure>>(`/finance/bill/fee-structures/${id}/items`, data),
    delete: (id: string) => api.delete(`/finance/bill/fee-structures/${id}`),
  },
};
