import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Provisions a relational guardian row AND a working parent-portal login in one
 * idempotent action (BUG-1 / Option B). Mirrors the existing credential pattern
 * (email + password → bcrypt → users row); no SMS is fired (matches student/staff
 * account creation). Idempotency: guardian keyed on (student_id, phone); parent
 * user keyed on email (an existing PARENT user is reused → multi-child support).
 */
export class ProvisionGuardianDto {
  @IsString() @MaxLength(50)
  relation!: string;

  @IsString() @MinLength(1) @MaxLength(100)
  firstName!: string;

  @IsOptional() @IsString() @MaxLength(100)
  lastName?: string;

  @IsString() @MinLength(1) @MaxLength(20)
  phone!: string;

  @IsEmail()
  email!: string;

  @IsString() @IsNotEmpty() @MinLength(8)
  password!: string;

  @IsOptional() @IsBoolean()
  isPrimary?: boolean;
}
