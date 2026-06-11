import {
  IsDateString,
  IsEmail,
  IsHexColor,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ManualOnboardTenantDto {
  @IsString()
  @MinLength(2)
  schoolName: string;

  @IsString()
  slug: string;

  @IsEmail()
  adminEmail: string;

  @IsString()
  adminFirstName: string;

  @IsString()
  adminLastName: string;

  @IsString()
  @MinLength(8)
  adminPassword: string;

  @IsUUID()
  planId: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  panNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;
}

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  schoolName?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsHexColor()
  primaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1800)
  @Max(2100)
  establishedYear?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  panNumber?: string;
}

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'CANCELLED', 'EXPIRED'])
  status?: 'ACTIVE' | 'CANCELLED' | 'EXPIRED';

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}

export class ListTenantsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'])
  status?: string;

  @IsOptional()
  @IsUUID()
  planId?: string;
}
