import { IsEmail, IsHexColor, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { BILL_BRAND_COLORS } from '../../../common/tenant-brand-color';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  /** FILE-1: storage keys from POST /files/presign-upload. Each wins over its
   *  legacy *Url twin; HEAD-verified against the kind policy before persist. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  logoFileKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  principalSignatureFileKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  schoolStampFileKey?: string;

  @IsOptional()
  @IsHexColor()
  primaryColor?: string;

  /** BILL-8: print-document accent — curated set only, unlike primaryColor's
   *  free-form web branding. See common/tenant-brand-color.ts. */
  @IsOptional()
  @IsIn(BILL_BRAND_COLORS)
  brandColor?: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(200)
  motto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  alternatePhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  affiliationBoard?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  affiliationNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  principalName?: string;

  @IsOptional()
  @IsString()
  principalSignatureUrl?: string;

  @IsOptional()
  @IsString()
  schoolStampUrl?: string;
}
