import {
  IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsMoneyString } from '../../../common/money/is-money-string.validator';

export enum ConcessionType {
  PERCENT = 'PERCENT',
  AMOUNT = 'AMOUNT',
}

export class CreateStudentConcessionDto {
  @IsUUID() studentId: string;
  @IsOptional() @IsUUID() feeHeadId?: string; // omitted = whole bill
  @IsUUID() academicYearId: string;
  @IsEnum(ConcessionType) type: ConcessionType;
  @IsMoneyString() value: string;
  @IsOptional() @IsMoneyString() capAmount?: string;
  @IsUUID() discountReasonId: string;
  @IsDateString() effectiveFrom: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class UpdateStudentConcessionDto {
  @IsOptional() @IsEnum(ConcessionType) type?: ConcessionType;
  @IsOptional() @IsMoneyString() value?: string;
  @IsOptional() @IsMoneyString() capAmount?: string;
  @IsOptional() @IsUUID() discountReasonId?: string;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class StudentConcessionQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
  @IsOptional() @IsUUID() studentId?: string;
  @IsOptional() @IsUUID() academicYearId?: string;
}
