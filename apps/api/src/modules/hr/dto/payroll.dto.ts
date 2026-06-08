import {
  IsArray, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID,
  Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OpenPayrollMonthDto {
  @IsInt()
  @Min(1)
  monthBs: number;

  @IsInt()
  @Min(2070)
  yearBs: number;

  @IsUUID()
  academicYearId: string;
}

class AllowanceDeductionItem {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Min(0)
  amount: number;
}

class PayrollOverrideDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsNumber()
  customBaseSalary?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllowanceDeductionItem)
  additionalAllowances?: AllowanceDeductionItem[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllowanceDeductionItem)
  additionalDeductions?: AllowanceDeductionItem[];
}

export class GeneratePayrollDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayrollOverrideDto)
  overrides?: PayrollOverrideDto[];
}

export class AdjustSlipDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllowanceDeductionItem)
  allowances?: AllowanceDeductionItem[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllowanceDeductionItem)
  deductions?: AllowanceDeductionItem[];

  @IsOptional()
  @IsInt()
  @Min(0)
  unpaidLeaveDays?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class PayrollMonthQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  status?: string;
}
