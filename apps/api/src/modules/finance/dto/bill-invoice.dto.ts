import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

const INVOICE_STATUSES = ['POSTED', 'SETTLED', 'PARTIALLY_PAID', 'VOIDED'] as const;

export class BillInvoiceQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsUUID() studentId?: string;
  @IsOptional() @IsUUID() classId?: string;
  @IsOptional() @IsUUID() academicYearId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) bsYear?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) bsMonth?: number;
  @IsOptional() @IsEnum(INVOICE_STATUSES) status?: string;
}
