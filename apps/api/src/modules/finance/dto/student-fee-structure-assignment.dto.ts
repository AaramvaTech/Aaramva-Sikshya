import { IsArray, IsDateString, IsEnum, IsOptional, IsUUID, ArrayMinSize } from 'class-validator';

export class AssignFeeStructureDto {
  @IsUUID() feeStructureId: string;
  @IsDateString() effectiveFrom: string;
}

/**
 * GET .../fee-structure — deliberately NOT paginated, unlike overrides/
 * concessions/transport-assignments' query DTOs (see UI-2-SPEC.md §2):
 * this is a single student's assignment history, bounded to a handful of
 * rows in practice, not an admin-wide filterable list.
 */
export class StudentFeeStructureAssignmentQueryDto {
  @IsOptional() @IsUUID() academicYearId?: string;
}

export enum BulkAssignScopeType {
  CLASS = 'CLASS',
  STUDENT_LIST = 'STUDENT_LIST',
}

/**
 * Spec §6: "accepts a class or explicit student list". CLASS optionally
 * narrows to one section; STUDENT_LIST takes explicit ids. Exactly one shape
 * is valid per scopeType — checked in the service (class-validator can't
 * express "these fields are required only when that enum value is X" without
 * a bespoke validator, and this codebase doesn't have one for that shape yet).
 */
export class BulkAssignDto {
  @IsEnum(BulkAssignScopeType) scopeType: BulkAssignScopeType;
  @IsOptional() @IsUUID() classId?: string;
  @IsOptional() @IsUUID() sectionId?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @IsUUID('4', { each: true }) studentIds?: string[];
  @IsDateString() effectiveFrom: string;
}
