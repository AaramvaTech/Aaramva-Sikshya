import { IsUUID, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class EnrollStudentDto {
  @IsUUID()
  classId: string;

  @IsUUID()
  sectionId: string;

  @IsUUID()
  academicYearId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rollNumber?: number;
}
