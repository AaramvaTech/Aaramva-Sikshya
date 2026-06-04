import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const STUDENT_STATUSES = ['ACTIVE', 'PASSED_OUT', 'EXPELLED', 'TRANSFERRED', 'DROPPED'] as const;
export type StudentStatus = typeof STUDENT_STATUSES[number];

export class UpdateStudentStatusDto {
  @IsIn(STUDENT_STATUSES)
  status!: StudentStatus;

  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}
