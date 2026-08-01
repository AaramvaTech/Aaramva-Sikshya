import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/** BILL-8 Checkpoint C (§5): class+period bulk print. Period is bs_year +
 *  bs_month — the same granularity bill_runs already bills at, so "this
 *  class's Shrawan 2083 invoices" is unambiguous. sectionId narrows within
 *  the class; omitted means every section. */
export class PrintClassDto {
  @IsUUID() classId: string;
  @IsOptional() @IsUUID() sectionId?: string;
  @IsInt() @Min(2000) @Max(2200) bsYear: number;
  @IsInt() @Min(1) @Max(12) bsMonth: number;
}
