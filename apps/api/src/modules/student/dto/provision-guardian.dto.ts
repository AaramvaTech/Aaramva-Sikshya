import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NEPAL_MOBILE_REGEX } from '../../common/utils/phone.util';

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

  // REG-1 §2: Nepali mobile (this DTO also keys guardian idempotency on phone).
  @IsString() @MinLength(1) @MaxLength(20)
  @Matches(NEPAL_MOBILE_REGEX, {
    message: 'phone must be a valid Nepali mobile number (9 followed by 6/7/8 and 8 digits)',
  })
  phone!: string;

  @IsEmail()
  email!: string;

  @IsString() @IsNotEmpty() @MinLength(8)
  password!: string;

  @IsOptional() @IsBoolean()
  isPrimary?: boolean;
}
