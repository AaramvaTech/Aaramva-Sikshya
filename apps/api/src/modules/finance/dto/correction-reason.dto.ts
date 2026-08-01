import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateCorrectionReasonDto {
  @IsString() @MaxLength(100) name: string;
  @IsString() @MaxLength(30) code: string;
  @IsOptional() @IsString() glAccountCode?: string;
}

export class UpdateCorrectionReasonDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(30) code?: string;
  @IsOptional() @IsString() glAccountCode?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CorrectionReasonQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number;

  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean()
  isActive?: boolean;
}
