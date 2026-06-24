import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

// ─── Grading Scale ─────────────────────────────────────────────────────────────

export class GradeThresholdDto {
  @IsString() grade: string;
  @IsOptional() @IsNumber() gpaPoint?: number;
  @IsNumber() minPercent: number;
  @IsNumber() maxPercent: number;
  @IsOptional() @IsString() remarks?: string;
}

export class CreateGradingScaleDto {
  @IsString() name: string;
  @IsArray() @Type(() => GradeThresholdDto) thresholds: GradeThresholdDto[];
}

// ─── Exam Type ─────────────────────────────────────────────────────────────────

export class CreateExamTypeDto {
  @IsString() name: string;
  @IsNumber() @Min(0) weightPercent: number;
  @IsUUID() academicYearId: string;
  @IsOptional() @IsUUID() gradingScaleId?: string;
  @IsNumber() @Min(1) orderIndex: number;
}

export class UpdateExamTypeDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() @Min(0) weightPercent?: number;
  @IsOptional() @IsUUID() gradingScaleId?: string;
  @IsOptional() @IsNumber() @Min(1) orderIndex?: number;
}

export class PublishExamTypeDto {
  @IsBoolean() published: boolean;
}

export class ExamTypeQueryDto {
  @IsOptional() @IsUUID() academicYearId?: string;
}

// ─── Exam Schedule ─────────────────────────────────────────────────────────────

export class CreateExamScheduleDto {
  @IsUUID() examTypeId: string;
  @IsUUID() classId: string;
  @IsUUID() subjectId: string;
  @IsString() examDate: string;
  @IsString() startTime: string;
  @IsString() endTime: string;
  @IsNumber() fullMarks: number;
  @IsNumber() passMarks: number;
  @IsOptional() @IsNumber() theoryMarks?: number;
  @IsOptional() @IsNumber() practicalMarks?: number;
  @IsOptional() @IsString() room?: string;
  @IsOptional() @IsUUID() invigilatorId?: string;
}

export class BulkScheduleSubjectDto {
  @IsUUID() subjectId: string;
  @IsString() examDate: string;
  @IsString() startTime: string;
  @IsString() endTime: string;
  @IsNumber() fullMarks: number;
  @IsNumber() passMarks: number;
  @IsOptional() @IsNumber() theoryMarks?: number;
  @IsOptional() @IsNumber() practicalMarks?: number;
  @IsOptional() @IsString() room?: string;
  @IsOptional() @IsUUID() invigilatorId?: string;
}

export class BulkCreateScheduleDto {
  @IsUUID() examTypeId: string;
  @IsUUID() classId: string;
  @IsArray() @Type(() => BulkScheduleSubjectDto) subjects: BulkScheduleSubjectDto[];
}

export class UpdateExamScheduleDto {
  @IsOptional() @IsString() examDate?: string;
  @IsOptional() @IsString() startTime?: string;
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @IsNumber() fullMarks?: number;
  @IsOptional() @IsNumber() passMarks?: number;
  @IsOptional() @IsString() room?: string;
  @IsOptional() @IsUUID() invigilatorId?: string;
}

export class ExamScheduleQueryDto {
  @IsOptional() @IsUUID() examTypeId?: string;
  @IsOptional() @IsUUID() classId?: string;
}

export class MyExamScheduleQueryDto {
  @IsOptional() @IsUUID() examTypeId?: string;
}

// ─── Marks ─────────────────────────────────────────────────────────────────────

export class MarkEntryDto {
  @IsUUID() studentId: string;
  @IsOptional() @IsNumber() @Min(0) marksObtained?: number;
  @IsOptional() @IsNumber() @Min(0) theoryMarks?: number;
  @IsOptional() @IsNumber() @Min(0) practicalMarks?: number;
  @IsOptional() @IsBoolean() isAbsent?: boolean;
  @IsOptional() @IsString() remarks?: string;
}

export class BulkEnterMarksDto {
  @IsUUID() examScheduleId: string;
  @IsArray() @Type(() => MarkEntryDto) marks: MarkEntryDto[];
}

export class UpdateMarkDto {
  @IsOptional() @IsNumber() @Min(0) marksObtained?: number;
  @IsOptional() @IsNumber() @Min(0) theoryMarks?: number;
  @IsOptional() @IsNumber() @Min(0) practicalMarks?: number;
  @IsOptional() @IsBoolean() isAbsent?: boolean;
  @IsOptional() @IsString() remarks?: string;
}

export class MarksQueryDto {
  @IsOptional() @IsUUID() examScheduleId?: string;
}

// ─── Results ───────────────────────────────────────────────────────────────────

export class ComputeResultsDto {
  @IsUUID() examTypeId: string;
  @IsUUID() classId: string;
  @IsOptional() @IsUUID() sectionId?: string;
}
