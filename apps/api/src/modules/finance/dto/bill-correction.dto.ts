import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { IsMoneyString } from '../../../common/money/is-money-string.validator';

export enum BillCorrectionType {
  CREDIT_NOTE = 'CREDIT_NOTE',
  REFUND = 'REFUND',
  WRITE_OFF = 'WRITE_OFF',
}

export enum RefundMethod {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
}

const CORRECTION_STATUSES = ['REQUESTED', 'APPROVED', 'REJECTED'] as const;

export class CreateCreditNoteDto {
  @IsUUID() studentId: string;
  @IsUUID() academicYearId: string;
  @IsUUID() targetInvoiceId: string;

  /** Optional line-level credit note (B6-2) — omit for a whole-invoice credit note. */
  @IsOptional() @IsUUID() targetInvoiceItemId?: string;

  @IsMoneyString() amount: string;
  @IsUUID() reasonId: string;
}

/** B6-5/B6-6: draws only from available advance credit — no invoice target. */
export class CreateRefundDto {
  @IsUUID() studentId: string;
  @IsUUID() academicYearId: string;
  @IsMoneyString() amount: string;
  @IsUUID() reasonId: string;
  @IsEnum(RefundMethod) refundMethod: RefundMethod;

  /** Required for BANK_TRANSFER (validated in the service — same convention as
   * CreateBillPaymentDto's cheque fields); optional voucher no. for CASH. */
  @IsOptional() @IsString() refundReference?: string;
}

/** Write-off targets a specific invoice OR the student's overall balance —
 * spec §3: "target invoice/balance exists and is outstanding." */
export class CreateWriteOffDto {
  @IsUUID() studentId: string;
  @IsUUID() academicYearId: string;

  /** Omit for a balance-level write-off (capped at the live ledger balance). */
  @IsOptional() @IsUUID() targetInvoiceId?: string;

  @IsMoneyString() amount: string;
  @IsUUID() reasonId: string;
}

/** Body for approve/reject — the only free text is the decider's own note. */
export class DecideCorrectionDto {
  @IsOptional() @IsString() note?: string;
}

export class BillCorrectionQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsUUID() studentId?: string;
  @IsOptional() @IsEnum(BillCorrectionType) type?: BillCorrectionType;
  @IsOptional() @IsEnum(CORRECTION_STATUSES) status?: string;
}
