import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Admin-facing create — always source='SCHOOL', always is_holiday=true; see
 *  CalendarService.createSchoolHoliday. Removing a holiday is done via
 *  DELETE (soft-delete), not by toggling isHoliday false through this DTO. */
export class CreateSchoolHolidayDto {
  @IsDateString()
  date: string;

  @IsString() @MinLength(1) @MaxLength(200)
  labelEn: string;

  @IsOptional() @IsString() @MaxLength(200)
  labelNe?: string;
}

export class UpdateSchoolHolidayDto {
  @IsOptional() @IsDateString()
  date?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  labelEn?: string;

  @IsOptional() @IsString() @MaxLength(200)
  labelNe?: string;
}

export class ListCalendarDaysQueryDto {
  @IsOptional() @IsDateString()
  fromDate?: string;

  @IsOptional() @IsDateString()
  toDate?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number = 50;
}
