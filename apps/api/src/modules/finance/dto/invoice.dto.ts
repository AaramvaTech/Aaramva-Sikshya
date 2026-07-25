import {
  IsArray, IsDateString, IsNumber, IsOptional, IsString,
  IsUUID, Max, Min,
} from 'class-validator';
import { IsMoneyString } from '../../../common/money/is-money-string.validator';

export class GenerateInvoiceDto {
  @IsUUID() studentId: string;
  @IsUUID() academicYearId: string;
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) feeStructureItemIds?: string[];
  @IsOptional() @IsDateString() dueDate?: string;
}

export class GenerateBulkInvoiceDto {
  @IsUUID() classId: string;
  @IsUUID() academicYearId: string;
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) feeStructureItemIds?: string[];
  @IsDateString() dueDate: string;
}

export class SetStudentFeeAssignmentDto {
  @IsUUID() feeStructureItemId: string;
  @IsUUID() academicYearId: string;
  @IsOptional() @IsMoneyString() customAmount?: string;
  // Percentage, not a money value — stays a plain number (0-100).
  @IsOptional() @IsNumber() @Min(0) @Max(100) discountPercent?: number;
  @IsOptional() @IsString() discountReason?: string;
  @IsOptional() isWaived?: boolean;
}

export class InvoiceQueryDto {
  page?: number;
  limit?: number;
  studentId?: string;
  classId?: string;
  academicYearId?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
}
