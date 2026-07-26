import {
  IsArray, IsDateString, IsInt, IsOptional, IsString, IsUUID, Min, MaxLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsMoneyString } from '../../../common/money/is-money-string.validator';

export class BillFeeStructureItemDto {
  @IsUUID() feeHeadId: string;
  @IsMoneyString() amount: string;
  @IsOptional() @IsString() recurrenceOverride?: string;
  @IsDateString() effectiveFrom: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class CreateBillFeeStructureDto {
  @IsUUID() academicYearId: string;
  @IsUUID() classId: string;
  @IsOptional() @IsUUID() sectionId?: string;
  @IsString() @MaxLength(200) name: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => BillFeeStructureItemDto)
  items: BillFeeStructureItemDto[];
}

export class UpdateBillFeeStructureItemsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => BillFeeStructureItemDto)
  items: BillFeeStructureItemDto[];
}

export class BillFeeStructureQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number;

  @IsOptional() @IsUUID()
  academicYearId?: string;

  @IsOptional() @IsUUID()
  classId?: string;
}
