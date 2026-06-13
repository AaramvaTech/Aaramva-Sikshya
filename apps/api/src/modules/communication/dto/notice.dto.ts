import { IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum NoticeType {
  GENERAL = 'GENERAL',
  EXAM = 'EXAM',
  FEE = 'FEE',
  HOLIDAY = 'HOLIDAY',
  EVENT = 'EVENT',
  URGENT = 'URGENT',
}

export enum NoticeAudience {
  ALL = 'ALL',
  TEACHERS = 'TEACHERS',
  PARENTS = 'PARENTS',
  STUDENTS = 'STUDENTS',
  CLASS = 'CLASS',
}

export class CreateNoticeDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsEnum(NoticeType)
  type?: NoticeType;

  @IsOptional()
  @IsEnum(NoticeAudience)
  audience?: NoticeAudience;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class UpdateNoticeDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsEnum(NoticeType)
  type?: NoticeType;

  @IsOptional()
  @IsEnum(NoticeAudience)
  audience?: NoticeAudience;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class ListNoticesQueryDto {
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

  @IsOptional()
  @IsEnum(NoticeAudience)
  audience?: NoticeAudience;

  @IsOptional()
  @IsEnum(NoticeType)
  type?: NoticeType;
}
