import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class AssignSubjectToClassDto {
  @IsUUID()
  subjectId: string;

  @IsUUID()
  academicYearId: string;

  @IsOptional() @IsInt() @Min(0)
  fullMarks?: number;

  @IsOptional() @IsInt() @Min(0)
  passMarks?: number;
}
