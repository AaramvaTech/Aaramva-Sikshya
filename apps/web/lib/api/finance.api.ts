import api from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  FeeCategory,
  FeeStructureSummary,
  FeeStructureDetail,
  FeeAssignment,
  InvoiceSummary,
  InvoiceDetail,
  Payment,
  CollectionReport,
  DefaulterStudent,
  StudentLedger,
  CreateFeeCategoryData,
  CreateFeeStructureData,
  GenerateInvoiceData,
  GenerateBulkInvoiceData,
  RecordPaymentData,
  InvoiceListParams,
  SetAssignmentData,
} from '@/types/api.types';

export const financeApi = {
  // Fee categories
  listCategories: () =>
    api.get<ApiResponse<PaginatedResponse<FeeCategory>>>('/finance/fee-categories'),
  createCategory: (data: CreateFeeCategoryData) =>
    api.post<ApiResponse<FeeCategory>>('/finance/fee-categories', data),

  // Fee structures
  listStructures: (params?: { academicYearId?: string }) =>
    api.get<ApiResponse<PaginatedResponse<FeeStructureSummary>>>('/finance/fee-structures', { params }),
  getStructure: (id: string) =>
    api.get<ApiResponse<FeeStructureDetail>>(`/finance/fee-structures/${id}`),
  createStructure: (data: CreateFeeStructureData) =>
    api.post<ApiResponse<FeeStructureDetail>>('/finance/fee-structures', data),

  // Student fee assignments
  getStudentAssignments: (studentId: string) =>
    api.get<ApiResponse<FeeAssignment[]>>(`/finance/students/${studentId}/assignments`),
  setStudentAssignment: (studentId: string, data: SetAssignmentData) =>
    api.post<ApiResponse<FeeAssignment>>(`/finance/students/${studentId}/assignments`, data),

  // Invoices
  listInvoices: (params: InvoiceListParams) =>
    api.get<ApiResponse<PaginatedResponse<InvoiceSummary>>>('/finance/invoices', { params }),
  getInvoice: (id: string) =>
    api.get<ApiResponse<InvoiceDetail>>(`/finance/invoices/${id}`),
  generateInvoice: (data: GenerateInvoiceData) =>
    api.post<ApiResponse<InvoiceDetail>>('/finance/invoices/generate', data),
  generateBulkInvoices: (data: GenerateBulkInvoiceData) =>
    api.post<ApiResponse<{ generated: number; skipped: number; errors: string[] }>>(
      '/finance/invoices/generate-bulk',
      data,
    ),
  voidInvoice: (id: string) =>
    api.delete(`/finance/invoices/${id}`),

  // Payments
  recordPayment: (data: RecordPaymentData) =>
    api.post<ApiResponse<Payment>>('/finance/payments', data),
  cancelPayment: (id: string) =>
    api.delete(`/finance/payments/${id}`),

  // Reports
  getCollectionReport: (params: { academicYearId: string }) =>
    api.get<ApiResponse<CollectionReport>>('/finance/reports/collection', { params }),
  getDefaulters: (params: { academicYearId?: string }) =>
    api.get<ApiResponse<DefaulterStudent[]>>('/finance/reports/defaulters', { params }),
  getStudentLedger: (studentId: string, params: { academicYearId: string }) =>
    api.get<ApiResponse<StudentLedger>>(`/finance/reports/student/${studentId}`, { params }),
};
