import {
  IsArray, IsDateString, IsInt, IsNumber, IsOptional,
  IsString, IsUUID, Max, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FeeStructureItemDto {
  @IsUUID() feeCategoryId: string;
  @IsNumber() @Min(0) amount: number;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsInt() @Min(1) @Max(28) dueDayOfMonth?: number;
  @IsOptional() @IsNumber() @Min(0) finePerDay?: number;
  @IsOptional() @IsInt() @Min(0) gracePeriodDays?: number;
}

export class CreateFeeStructureDto {
  @IsUUID() classId: string;
  @IsUUID() academicYearId: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => FeeStructureItemDto)
  items: FeeStructureItemDto[];
}

export class UpdateFeeStructureItemsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => FeeStructureItemDto)
  items: FeeStructureItemDto[];
}

export class FeeStructureQueryDto {
  page?: number;
  limit?: number;
  classId?: string;
  academicYearId?: string;
}
