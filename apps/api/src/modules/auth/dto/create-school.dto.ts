import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSchoolDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  schoolName!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must be lowercase letters, numbers and hyphens only',
  })
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  adminFirstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  adminLastName!: string;

  @IsEmail()
  adminEmail!: string;

  // REG-OBS-5: no chosen password — the SCHOOL_OWNER gets a generated temp password
  // (must_change_password = true) delivered via the new tenant's ledger, like every
  // other REG-1 account.

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;
}
