import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum StudentAttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LATE = 'LATE',
  LEAVE = 'LEAVE',
}

export class AttendanceRecordDto {
  @IsUUID()
  studentId: string;

  @IsEnum(StudentAttendanceStatus)
  status: StudentAttendanceStatus;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class BulkStudentAttendanceDto {
  @IsUUID()
  sectionId: string;

  @IsUUID()
  academicYearId: string;

  @IsDateString()
  date: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordDto)
  records: AttendanceRecordDto[];
}

export class GetAttendanceQueryDto {
  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsEnum(StudentAttendanceStatus)
  status?: StudentAttendanceStatus;

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

export class GetSectionReportQueryDto {
  @IsDateString()
  fromDate: string;

  @IsDateString()
  toDate: string;

  @IsUUID()
  academicYearId: string;
}

export class GetStudentHistoryQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

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
