import { IsDateString, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class StudentMeAttendanceSummaryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;
}

export class StudentMeAttendanceHistoryDto {
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

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
}
