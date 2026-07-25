import { Prisma } from '@prisma/client';
import { toMoney } from './finance.entity';

/**
 * tax_rates.rate is NUMERIC(5,3) — 3 decimal places, unlike every other
 * money/rate column in this module (all NUMERIC(*,2)). Money is deliberately
 * hardcoded to 2dp rounding (BILL-0), so routing a rate through toMoney()
 * would silently truncate its third digit. This is a pure DB-string-to-number
 * read (no arithmetic, nothing to round) via the same Decimal engine Money
 * wraps, so it still never touches parseFloat/Number().
 */
function toDecimalNumber(v: string | number): number {
  return new Prisma.Decimal(v).toNumber();
}

// ─── DB row shapes ────────────────────────────────────────────────────────────

export interface FeeHeadRow {
  id: string;
  name: string;
  code: string;
  recurrence: string;
  is_taxable: boolean;
  is_refundable: boolean;
  proration_policy: string;
  gl_account_code: string | null;
  display_order: number;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface DiscountReasonRow {
  id: string;
  name: string;
  code: string;
  gl_account_code: string | null;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface TransportRouteRow {
  id: string;
  name: string;
  code: string;
  monthly_amount: string | number;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface TaxRateRow {
  id: string;
  name: string;
  rate: string | number;
  applies_to: string;
  effective_from: Date | string;
  effective_to: Date | string | null;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface LateFeeRuleRow {
  id: string;
  scope: string;
  fee_head_id: string | null;
  type: string;
  value: string | number;
  grace_days: number;
  cap_amount: string | number | null;
  is_enabled: boolean;
  effective_from: Date | string;
  effective_to: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface BillFeeStructureRow {
  id: string;
  academic_year_id: string;
  class_id: string;
  section_id: string | null;
  name: string;
  is_active: boolean;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface BillFeeStructureItemRow {
  id: string;
  fee_structure_id: string;
  fee_head_id: string;
  fee_head_name?: string;
  amount: string | number;
  recurrence_override: string | null;
  effective_from: Date | string;
  effective_to: Date | string | null;
  created_at: Date | string;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export interface FeeHeadResponseDto {
  id: string;
  name: string;
  code: string;
  recurrence: string;
  isTaxable: boolean;
  isRefundable: boolean;
  prorationPolicy: string;
  glAccountCode: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface DiscountReasonResponseDto {
  id: string;
  name: string;
  code: string;
  glAccountCode: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface TransportRouteResponseDto {
  id: string;
  name: string;
  code: string;
  monthlyAmount: number;
  isActive: boolean;
  createdAt: string;
}

export interface TaxRateResponseDto {
  id: string;
  name: string;
  rate: number;
  appliesTo: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdBy: string;
  createdAt: string;
}

export interface LateFeeRuleResponseDto {
  id: string;
  scope: string;
  feeHeadId: string | null;
  type: string;
  value: number;
  graceDays: number;
  capAmount: number | null;
  isEnabled: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
}

export interface BillFeeStructureItemResponseDto {
  id: string;
  feeHeadId: string;
  feeHeadName?: string;
  amount: number;
  recurrenceOverride: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface BillFeeStructureResponseDto {
  id: string;
  academicYearId: string;
  classId: string;
  sectionId: string | null;
  name: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  items?: BillFeeStructureItemResponseDto[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

function toDateOnly(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().split('T')[0];
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function toFeeHeadResponse(row: FeeHeadRow): FeeHeadResponseDto {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    recurrence: row.recurrence,
    isTaxable: row.is_taxable,
    isRefundable: row.is_refundable,
    prorationPolicy: row.proration_policy,
    glAccountCode: row.gl_account_code,
    displayOrder: row.display_order,
    isActive: row.is_active,
    createdAt: toIso(row.created_at),
  };
}

export function toDiscountReasonResponse(row: DiscountReasonRow): DiscountReasonResponseDto {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    glAccountCode: row.gl_account_code,
    isActive: row.is_active,
    createdAt: toIso(row.created_at),
  };
}

export function toTransportRouteResponse(row: TransportRouteRow): TransportRouteResponseDto {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    monthlyAmount: toMoney(row.monthly_amount).toNumber(),
    isActive: row.is_active,
    createdAt: toIso(row.created_at),
  };
}

export function toTaxRateResponse(row: TaxRateRow): TaxRateResponseDto {
  return {
    id: row.id,
    name: row.name,
    rate: toDecimalNumber(row.rate),
    appliesTo: row.applies_to,
    effectiveFrom: toDateOnly(row.effective_from),
    effectiveTo: row.effective_to ? toDateOnly(row.effective_to) : null,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
  };
}

export function toLateFeeRuleResponse(row: LateFeeRuleRow): LateFeeRuleResponseDto {
  return {
    id: row.id,
    scope: row.scope,
    feeHeadId: row.fee_head_id,
    type: row.type,
    value: toMoney(row.value).toNumber(),
    graceDays: row.grace_days,
    capAmount: row.cap_amount != null ? toMoney(row.cap_amount).toNumber() : null,
    isEnabled: row.is_enabled,
    effectiveFrom: toDateOnly(row.effective_from),
    effectiveTo: row.effective_to ? toDateOnly(row.effective_to) : null,
    createdAt: toIso(row.created_at),
  };
}

export function toBillFeeStructureItemResponse(row: BillFeeStructureItemRow): BillFeeStructureItemResponseDto {
  return {
    id: row.id,
    feeHeadId: row.fee_head_id,
    feeHeadName: row.fee_head_name,
    amount: toMoney(row.amount).toNumber(),
    recurrenceOverride: row.recurrence_override,
    effectiveFrom: toDateOnly(row.effective_from),
    effectiveTo: row.effective_to ? toDateOnly(row.effective_to) : null,
  };
}

export function toBillFeeStructureResponse(
  row: BillFeeStructureRow,
  items?: BillFeeStructureItemRow[],
): BillFeeStructureResponseDto {
  return {
    id: row.id,
    academicYearId: row.academic_year_id,
    classId: row.class_id,
    sectionId: row.section_id,
    name: row.name,
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    items: items?.map(toBillFeeStructureItemResponse),
  };
}
