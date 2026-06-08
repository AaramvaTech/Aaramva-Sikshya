import { IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SendSmsDto {
  @IsString()
  toNumber: string;

  @IsString()
  @MaxLength(160)
  message: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;
}

export enum BulkSmsAudience {
  CLASS = 'CLASS',
  SECTION = 'SECTION',
  ALL_PARENTS = 'ALL_PARENTS',
  ALL_TEACHERS = 'ALL_TEACHERS',
  CUSTOM = 'CUSTOM',
}

export class BulkSmsDto {
  @IsEnum(BulkSmsAudience)
  audience: BulkSmsAudience;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customNumbers?: string[];

  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  trigger?: string;
}

export class SmsLogsQueryDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;

  @IsOptional()
  @IsString()
  status?: string;
}
