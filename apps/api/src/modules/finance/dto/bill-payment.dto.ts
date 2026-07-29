import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString,
  IsUUID, Max, Min, ValidateNested,
} from 'class-validator';
import { IsMoneyString } from '../../../common/money/is-money-string.validator';

export enum BillPaymentMethod {
  CASH = 'CASH',
  CHEQUE = 'CHEQUE',
  BANK_TRANSFER = 'BANK_TRANSFER',
  ESEWA = 'ESEWA',
  KHALTI = 'KHALTI',
}

export enum BillPaymentAllocationMode {
  AUTO_FIFO = 'AUTO_FIFO',
  MANUAL = 'MANUAL',
  ADVANCE_ONLY = 'ADVANCE_ONLY',
}

const PAYMENT_STATUSES = ['CLEARED', 'PENDING', 'BOUNCED', 'VOIDED'] as const;

export class ManualAllocationTargetDto {
  @IsUUID() billInvoiceId: string;
  @IsMoneyString() amount: string;
}

/**
 * targets' "required only when allocationMode is MANUAL" is checked in
 * BillPaymentService, not here — matches this codebase's established
 * convention (see CreateBillRunDto's identical comment on classId in
 * bill-run.dto.ts: "this codebase doesn't have a bespoke validator for that
 * shape yet").
 */
export class CreateBillPaymentDto {
  @IsUUID() studentId: string;

  @IsUUID() academicYearId: string;

  @IsMoneyString() amount: string;

  @IsEnum(BillPaymentMethod) method: BillPaymentMethod;

  @IsEnum(BillPaymentAllocationMode) allocationMode: BillPaymentAllocationMode;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ManualAllocationTargetDto)
  targets?: ManualAllocationTargetDto[];

  /** Defaults to today (Nepal AD) — see BillPaymentService. */
  @IsOptional() @IsDateString() receivedDate?: string;

  @IsOptional() @IsString() reference?: string;

  @IsOptional() @IsString() notes?: string;

  /** CHEQUE-only metadata — required when method is CHEQUE, validated in BillPaymentService (same convention as targets/MANUAL). */
  @IsOptional() @IsString() chequeBank?: string;
  @IsOptional() @IsDateString() chequeDate?: string;
}

export class BillPaymentQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsUUID() studentId?: string;
  @IsOptional() @IsEnum(BillPaymentMethod) method?: BillPaymentMethod;
  @IsOptional() @IsEnum(PAYMENT_STATUSES) status?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}
