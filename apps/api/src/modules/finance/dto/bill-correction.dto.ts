import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { IsMoneyString } from '../../../common/money/is-money-string.validator';

export enum BillCorrectionType {
  CREDIT_NOTE = 'CREDIT_NOTE',
  REFUND = 'REFUND',
  WRITE_OFF = 'WRITE_OFF',
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
