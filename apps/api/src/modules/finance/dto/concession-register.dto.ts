import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ConcessionRegisterQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
  @IsOptional() @IsUUID() academicYearId?: string;
  @IsOptional() @IsUUID() classId?: string;
  @IsOptional() @IsUUID() discountReasonId?: string;
}
