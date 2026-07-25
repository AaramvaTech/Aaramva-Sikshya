import { IsDateString, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { IsMoneyString } from '../../../common/money/is-money-string.validator';

export class CreateStudentFeeOverrideDto {
  @IsUUID() studentId: string;
  @IsUUID() feeHeadId: string;
  @IsUUID() academicYearId: string;
  @IsMoneyString() overrideAmount: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsDateString() effectiveFrom: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class UpdateStudentFeeOverrideDto {
  @IsOptional() @IsMoneyString() overrideAmount?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class StudentFeeOverrideQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
  @IsOptional() @IsUUID() studentId?: string;
  @IsOptional() @IsUUID() academicYearId?: string;
}
