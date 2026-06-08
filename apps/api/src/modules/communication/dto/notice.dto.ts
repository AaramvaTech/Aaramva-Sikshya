import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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
  page?: number;

  @IsOptional()
  limit?: number;

  @IsOptional()
  @IsEnum(NoticeAudience)
  audience?: NoticeAudience;

  @IsOptional()
  @IsEnum(NoticeType)
  type?: NoticeType;
}
