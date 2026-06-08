import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateTimetableSlotDto {
  @IsUUID()
  sectionId: string;

  @IsUUID()
  subjectId: string;

  @IsUUID()
  teacherId: string;

  @IsUUID()
  academicYearId: string;

  @IsInt() @Min(0) @Max(6)
  dayOfWeek: number;

  @IsInt() @Min(1) @Max(8)
  periodNumber: number;

  @IsString()
  startTime: string;

  @IsString()
  endTime: string;

  @IsOptional() @IsString()
  room?: string;
}

export class BulkTimetableSlotDto {
  @IsUUID()
  subjectId: string;

  @IsUUID()
  teacherId: string;

  @IsInt() @Min(0) @Max(6)
  dayOfWeek: number;

  @IsInt() @Min(1) @Max(8)
  periodNumber: number;

  @IsString()
  startTime: string;

  @IsString()
  endTime: string;

  @IsOptional() @IsString()
  room?: string;
}

export class BulkTimetableDto {
  @IsUUID()
  academicYearId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkTimetableSlotDto)
  slots: BulkTimetableSlotDto[];
}
