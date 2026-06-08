import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum LeaveStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class ApplyLeaveDto {
  @IsUUID()
  studentId: string;

  @IsUUID()
  academicYearId: string;

  @IsDateString()
  fromDate: string;

  @IsDateString()
  toDate: string;

  @IsString()
  reason: string;
}

export class ReviewLeaveDto {
  @IsEnum({ APPROVED: 'APPROVED', REJECTED: 'REJECTED' })
  status: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class GetLeaveQueryDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsEnum(LeaveStatus)
  status?: LeaveStatus;

  @IsOptional()
  @IsUUID()
  academicYearId?: string;

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
