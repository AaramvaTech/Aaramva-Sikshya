import { toMoney } from './finance.entity';

// ─── DB row shapes ────────────────────────────────────────────────────────────

export interface StudentFeeStructureAssignmentRow {
  id: string;
  student_id: string;
  fee_structure_id: string;
  academic_year_id: string;
  effective_from: Date | string;
  effective_to: Date | string | null;
  assigned_by: string;
  class_mismatch_overridden: boolean;
  overridden_by_user_id: string | null;
  overridden_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface StudentFeeOverrideRow {
  id: string;
  student_id: string;
  fee_head_id: string;
  fee_head_name?: string;
  academic_year_id: string;
  override_amount: string | number;
  reason: string | null;
  effective_from: Date | string;
  effective_to: Date | string | null;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface StudentConcessionRow {
  id: string;
  student_id: string;
  fee_head_id: string | null;
  fee_head_name?: string;
  academic_year_id: string;
  type: string;
  value: string | number;
  cap_amount: string | number | null;
  discount_reason_id: string;
  discount_reason_name?: string;
  effective_from: Date | string;
  effective_to: Date | string | null;
  notes: string | null;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface StudentTransportAssignmentRow {
  id: string;
  student_id: string;
  transport_route_id: string;
  effective_from: Date | string;
  effective_to: Date | string | null;
  assigned_by: string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

/**
 * FEE-CLASS-GUARD: the job's per-student outcome list gains an optional
 * machine-readable `reason`. It stays optional because every pre-existing
 * failure row in bulk_assign_jobs.failures (jsonb, never migrated) has only
 * {studentId, error} — a required field would misrepresent history. Absent
 * reason = the original "student not found or inactive" outcome.
 */
export type BulkAssignFailureReason = 'STUDENT_INVALID' | 'CLASS_MISMATCH';

export interface BulkAssignFailure {
  studentId: string;
  error: string;
  reason?: BulkAssignFailureReason;
}

export interface BulkAssignJobRow {
  id: string;
  fee_structure_id: string;
  academic_year_id: string;
  scope_type: string;
  scope_class_id: string | null;
  scope_section_id: string | null;
  scope_student_ids: string[] | null;
  effective_from: Date | string;
  allow_cross_class: boolean;
  status: string;
  total: number;
  processed: number;
  failed_count: number;
  failures: BulkAssignFailure[];
  created_by: string;
  created_at: Date | string;
  started_at: Date | string | null;
  completed_at: Date | string | null;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export interface StudentFeeStructureAssignmentResponseDto {
  id: string;
  studentId: string;
  feeStructureId: string;
  academicYearId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  assignedBy: string;
  classMismatchOverridden: boolean;
  overriddenBy: string | null;
  overriddenAt: string | null;
  createdAt: string;
}

export interface StudentFeeOverrideResponseDto {
  id: string;
  studentId: string;
  feeHeadId: string;
  feeHeadName?: string;
  academicYearId: string;
  overrideAmount: number;
  reason: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdBy: string;
  createdAt: string;
  /**
   * FEE-CLASS-GUARD-2 path 4 — is there any assignment for this student whose
   * fee structure actually contains this head? When false the override is
   * INERT: it is stored, it is valid, and nothing will apply it.
   *
   * COMPUTED AT READ TIME, never stored. Inertness is derived state that
   * changes without the override changing — assign the structure tomorrow and
   * the same row becomes live. A stored flag would go stale in exactly the
   * silent-wrong direction this ticket exists to fix.
   */
  appliesToAssignedStructure: boolean;
}

export interface StudentConcessionResponseDto {
  id: string;
  studentId: string;
  feeHeadId: string | null;
  feeHeadName?: string;
  academicYearId: string;
  type: string;
  value: number;
  capAmount: number | null;
  discountReasonId: string;
  discountReasonName?: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

export interface StudentTransportAssignmentResponseDto {
  id: string;
  studentId: string;
  transportRouteId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  assignedBy: string;
  createdAt: string;
}

export interface BulkAssignJobResponseDto {
  id: string;
  feeStructureId: string;
  academicYearId: string;
  scopeType: string;
  scopeClassId: string | null;
  scopeSectionId: string | null;
  effectiveFrom: string;
  allowCrossClassAssignment: boolean;
  status: string;
  total: number;
  processed: number;
  failedCount: number;
  failures: BulkAssignFailure[];
  createdBy: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
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

export function toStudentFeeStructureAssignmentResponse(
  row: StudentFeeStructureAssignmentRow,
): StudentFeeStructureAssignmentResponseDto {
  return {
    id: row.id,
    studentId: row.student_id,
    feeStructureId: row.fee_structure_id,
    academicYearId: row.academic_year_id,
    effectiveFrom: toDateOnly(row.effective_from),
    effectiveTo: row.effective_to ? toDateOnly(row.effective_to) : null,
    assignedBy: row.assigned_by,
    classMismatchOverridden: !!row.class_mismatch_overridden,
    overriddenBy: row.overridden_by_user_id ?? null,
    overriddenAt: row.overridden_at ? toIso(row.overridden_at) : null,
    createdAt: toIso(row.created_at),
  };
}

export function toStudentFeeOverrideResponse(
  row: StudentFeeOverrideRow,
  appliesToAssignedStructure = false,
): StudentFeeOverrideResponseDto {
  return {
    appliesToAssignedStructure,
    id: row.id,
    studentId: row.student_id,
    feeHeadId: row.fee_head_id,
    feeHeadName: row.fee_head_name,
    academicYearId: row.academic_year_id,
    overrideAmount: toMoney(row.override_amount).toNumber(),
    reason: row.reason,
    effectiveFrom: toDateOnly(row.effective_from),
    effectiveTo: row.effective_to ? toDateOnly(row.effective_to) : null,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
  };
}

export function toStudentConcessionResponse(row: StudentConcessionRow): StudentConcessionResponseDto {
  return {
    id: row.id,
    studentId: row.student_id,
    feeHeadId: row.fee_head_id,
    feeHeadName: row.fee_head_name,
    academicYearId: row.academic_year_id,
    type: row.type,
    value: toMoney(row.value).toNumber(),
    capAmount: row.cap_amount != null ? toMoney(row.cap_amount).toNumber() : null,
    discountReasonId: row.discount_reason_id,
    discountReasonName: row.discount_reason_name,
    effectiveFrom: toDateOnly(row.effective_from),
    effectiveTo: row.effective_to ? toDateOnly(row.effective_to) : null,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
  };
}

export function toStudentTransportAssignmentResponse(
  row: StudentTransportAssignmentRow,
): StudentTransportAssignmentResponseDto {
  return {
    id: row.id,
    studentId: row.student_id,
    transportRouteId: row.transport_route_id,
    effectiveFrom: toDateOnly(row.effective_from),
    effectiveTo: row.effective_to ? toDateOnly(row.effective_to) : null,
    assignedBy: row.assigned_by,
    createdAt: toIso(row.created_at),
  };
}

export function toBulkAssignJobResponse(row: BulkAssignJobRow): BulkAssignJobResponseDto {
  return {
    id: row.id,
    feeStructureId: row.fee_structure_id,
    academicYearId: row.academic_year_id,
    scopeType: row.scope_type,
    scopeClassId: row.scope_class_id,
    scopeSectionId: row.scope_section_id,
    effectiveFrom: toDateOnly(row.effective_from),
    allowCrossClassAssignment: !!row.allow_cross_class,
    status: row.status,
    total: row.total,
    processed: row.processed,
    failedCount: row.failed_count,
    failures: row.failures ?? [],
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    startedAt: row.started_at ? toIso(row.started_at) : null,
    completedAt: row.completed_at ? toIso(row.completed_at) : null,
  };
}
