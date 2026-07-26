import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export enum BillRunScope {
  CLASS = 'CLASS',
  WHOLE_SCHOOL = 'WHOLE_SCHOOL',
}

const RUN_STATUSES = ['DRAFT', 'POSTING', 'POSTED', 'VOIDED'] as const;
const LINE_OUTCOMES = [
  'DRAFT', 'POSTED', 'SKIPPED_NO_ASSIGNMENT', 'SKIPPED_ALREADY_BILLED', 'EXCLUDED', 'FAILED',
] as const;

/**
 * classId's "required only when scope is CLASS" is checked in the service,
 * not expressed here via @ValidateIf — matches this codebase's established
 * convention (see BulkAssignDto's identical comment in
 * student-fee-structure-assignment.dto.ts: "this codebase doesn't have a
 * bespoke validator for that shape yet").
 */
export class CreateBillRunDto {
  @IsUUID() academicYearId: string;

  @IsEnum(BillRunScope) scope: BillRunScope;

  @IsOptional() @IsUUID() classId?: string;

  @Type(() => Number) @IsInt() @Min(2000) @Max(2100) bsYear: number;

  @Type(() => Number) @IsInt() @Min(1) @Max(12) bsMonth: number;

  /** Defaults to today (Nepal AD) — see BillRunService. R7: issue date is independent of the billed period. */
  @IsOptional() @IsDateString() issueDate?: string;

  /** Defaults to issueDate + DEFAULT_DUE_DAYS — see bill-run.util.ts and BILL-BUGS.md (R8's tenant setting doesn't exist as infrastructure yet). */
  @IsOptional() @IsDateString() dueDate?: string;
}

export class BillRunQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsUUID() academicYearId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) bsYear?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) bsMonth?: number;
  @IsOptional() @IsEnum(RUN_STATUSES) status?: string;
}

export class BillRunLineQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @IsEnum(LINE_OUTCOMES) outcome?: string;
}
