import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAssignmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsUUID()
  classId: string;

  /** omitted / null = whole class */
  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsUUID()
  subjectId: string;

  /** defaults to the current academic year */
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsDateString()
  dueDate: string;

  /** FILE-1 keys (kind assignment-attachment), each HEAD-verified on accept */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(512, { each: true })
  attachmentKeys?: string[];
}

export class UpdateAssignmentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(512, { each: true })
  attachmentKeys?: string[];
}

export class AssignmentQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'CLOSED'])
  status?: string;

  @IsOptional()
  @IsIn(['due_date', 'created_at', 'title'])
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: string;
}

export class SubmitAssignmentDto {
  /** at least one of textAnswer | fileKey (service-enforced) */
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  textAnswer?: string;

  /** FILE-1 key (kind submission-file) from the assignment-scoped presign */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  fileKey?: string;
}

export class SubmissionPresignDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename: string;

  @IsString()
  @IsNotEmpty()
  contentType: string;

  @IsInt()
  @Min(1)
  size: number;
}

export class ReviewSubmissionDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999.99)
  marks?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  feedback?: string;
}
