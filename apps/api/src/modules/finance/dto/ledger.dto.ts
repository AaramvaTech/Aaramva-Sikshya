import {
  IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsMoneyString } from '../../../common/money/is-money-string.validator';

export class OpeningBalanceRowDto {
  @IsUUID() studentId: string;
  @IsUUID() academicYearId: string;
  @IsMoneyString() amount: string;
  @IsIn(['DEBIT', 'CREDIT']) direction: 'DEBIT' | 'CREDIT';
  @IsOptional() @IsString() @MaxLength(500) narration?: string;
}

/**
 * Spec §7 says "accepts CSV or JSON" — this accepts JSON rows only (BILL-BUGS
 * BUGS-5). A CSV upload would ultimately normalize to this same row shape
 * anyway; the parsing step itself wasn't worth building for this proof.
 */
export class OpeningBalanceImportDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => OpeningBalanceRowDto)
  rows: OpeningBalanceRowDto[];
}

export class LedgerAdjustmentDto {
  @IsUUID() studentId: string;
  @IsUUID() academicYearId: string;
  @IsMoneyString() amount: string;
  @IsIn(['DEBIT', 'CREDIT']) direction: 'DEBIT' | 'CREDIT';
  @IsString() @MaxLength(200) reason: string;
  @IsString() @MaxLength(1000) narration: string;
}

export class LedgerQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}
