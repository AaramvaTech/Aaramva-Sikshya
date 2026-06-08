import { adToBs } from 'bs-calendar';

// ─── DB row shapes ────────────────────────────────────────────────────────────

export interface FeeCategoryRow {
  id: string;
  name: string;
  type: string;
  description: string | null;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface FeeStructureRow {
  id: string;
  class_id: string;
  academic_year_id: string;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface FeeStructureItemRow {
  id: string;
  fee_structure_id: string;
  fee_category_id: string;
  fee_category_name: string;
  amount: string | number;
  due_day_of_month: number | null;
  due_date: Date | string | null;
  fine_per_day: string | number;
  grace_period_days: number;
  created_at: Date | string;
}

export interface StudentFeeAssignmentRow {
  id: string;
  student_id: string;
  fee_structure_item_id: string;
  academic_year_id: string;
  custom_amount: string | number | null;
  discount_percent: string | number;
  discount_reason: string | null;
  is_waived: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface InvoiceRow {
  id: string;
  invoice_number: string;
  student_id: string;
  academic_year_id: string;
  due_date: Date | string;
  status: string;
  subtotal: string | number;
  discount_amount: string | number;
  fine_amount: string | number;
  total_amount: string | number;
  paid_amount: string | number;
  balance: string | number;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface InvoiceItemRow {
  id: string;
  invoice_id: string;
  fee_category_id: string;
  fee_category_name: string;
  original_amount: string | number;
  discount_percent: string | number;
  discounted_amount: string | number;
  fine_per_day: string | number;
  grace_period_days: number;
  created_at: Date | string;
}

export interface PaymentRow {
  id: string;
  payment_number: string;
  invoice_id: string;
  student_id: string;
  amount: string | number;
  method: string;
  reference: string | null;
  notes: string | null;
  received_by: string;
  created_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export interface BsAdDate { ad: string; bs: string; }

export interface FeeCategoryResponseDto {
  id: string;
  name: string;
  type: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface FeeStructureItemResponseDto {
  id: string;
  feeCategoryId: string;
  feeCategoryName: string;
  amount: number;
  dueDayOfMonth: number | null;
  dueDate: BsAdDate | null;
  finePerDay: number;
  gracePeriodDays: number;
}

export interface FeeStructureResponseDto {
  id: string;
  classId: string;
  academicYearId: string;
  className?: string;
  academicYearName?: string;
  itemCount?: number;
  totalAmount?: number;
  createdBy: string;
  createdAt: string;
  items?: FeeStructureItemResponseDto[];
}

export interface InvoiceItemResponseDto {
  id: string;
  feeCategoryId: string;
  feeCategoryName: string;
  originalAmount: number;
  discountPercent: number;
  discountedAmount: number;
}

export interface PaymentResponseDto {
  id: string;
  paymentNumber: string;
  invoiceId: string;
  studentId: string;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  receivedBy: string;
  createdAt: string;
}

export interface InvoiceResponseDto {
  id: string;
  invoiceNumber: string;
  studentId: string;
  academicYearId: string;
  dueDate: BsAdDate;
  status: string;
  subtotal: number;
  discountAmount: number;
  fineAmount: number;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  createdBy: string;
  createdAt: string;
  items?: InvoiceItemResponseDto[];
  payments?: PaymentResponseDto[];
}

// ─── Internal helper used by InvoiceService ───────────────────────────────────

export interface InvoiceItemToCreate {
  feeCategoryId: string;
  feeCategoryName: string;
  originalAmount: number;
  discountPercent: number;
  discountedAmount: number;
  finePerDay: number;
  gracePeriodDays: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function toAdString(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().split('T')[0];
}

export function toBsString(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  const bs = adToBs(date);
  return `${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')}`;
}

export function toDateField(d: Date | string): BsAdDate {
  return { ad: toAdString(d), bs: toBsString(d) };
}

export function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : parseFloat(v);
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function toFeeCategoryResponse(row: FeeCategoryRow): FeeCategoryResponseDto {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description,
    isActive: row.is_active,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

export function toFeeStructureItemResponse(row: FeeStructureItemRow): FeeStructureItemResponseDto {
  return {
    id: row.id,
    feeCategoryId: row.fee_category_id,
    feeCategoryName: row.fee_category_name,
    amount: toNum(row.amount),
    dueDayOfMonth: row.due_day_of_month,
    dueDate: row.due_date ? toDateField(row.due_date) : null,
    finePerDay: toNum(row.fine_per_day),
    gracePeriodDays: row.grace_period_days,
  };
}

export function toFeeStructureResponse(
  row: FeeStructureRow,
  items?: FeeStructureItemRow[],
): FeeStructureResponseDto {
  return {
    id: row.id,
    classId: row.class_id,
    academicYearId: row.academic_year_id,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    items: items?.map(toFeeStructureItemResponse),
  };
}

export function toInvoiceItemResponse(row: InvoiceItemRow): InvoiceItemResponseDto {
  return {
    id: row.id,
    feeCategoryId: row.fee_category_id,
    feeCategoryName: row.fee_category_name,
    originalAmount: toNum(row.original_amount),
    discountPercent: toNum(row.discount_percent),
    discountedAmount: toNum(row.discounted_amount),
  };
}

export function toPaymentResponse(row: PaymentRow): PaymentResponseDto {
  return {
    id: row.id,
    paymentNumber: row.payment_number,
    invoiceId: row.invoice_id,
    studentId: row.student_id,
    amount: toNum(row.amount),
    method: row.method,
    reference: row.reference,
    notes: row.notes,
    receivedBy: row.received_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

export function toInvoiceResponse(
  row: InvoiceRow,
  items?: InvoiceItemRow[],
  payments?: PaymentRow[],
): InvoiceResponseDto {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    studentId: row.student_id,
    academicYearId: row.academic_year_id,
    dueDate: toDateField(row.due_date),
    status: row.status,
    subtotal: toNum(row.subtotal),
    discountAmount: toNum(row.discount_amount),
    fineAmount: toNum(row.fine_amount),
    totalAmount: toNum(row.total_amount),
    paidAmount: toNum(row.paid_amount),
    balance: toNum(row.balance),
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    items: items?.map(toInvoiceItemResponse),
    payments: payments?.map(toPaymentResponse),
  };
}
