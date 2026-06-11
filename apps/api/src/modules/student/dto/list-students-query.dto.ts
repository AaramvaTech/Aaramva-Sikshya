import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class ListStudentsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number = 20;

  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @IsString()
  className?: string;

  @IsOptional() @IsString()
  section?: string;

  @IsOptional() @IsUUID()
  classId?: string;

  @IsOptional() @IsUUID()
  sectionId?: string;

  @IsOptional() @IsIn(['ACTIVE', 'PASSED_OUT', 'EXPELLED', 'TRANSFERRED', 'DROPPED'])
  status?: string;

  @IsOptional() @IsIn(['created_at', 'first_name', 'last_name', 'student_id', 'admission_date'])
  sortBy?: string = 'created_at';

  @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
