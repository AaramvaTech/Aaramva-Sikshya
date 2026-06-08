import {
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

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
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
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
