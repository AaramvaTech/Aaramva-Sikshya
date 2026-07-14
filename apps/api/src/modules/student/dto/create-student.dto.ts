import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NEPAL_MOBILE_REGEX } from '../../common/utils/phone.util';

// REG-1 §2: Nepali mobile, validated on input, stored E.164 (+977…) by the service.
const NEPAL_MOBILE_MESSAGE =
  'phone must be a valid Nepali mobile number (9 followed by 6/7/8 and 8 digits)';

export class GuardianInputDto {
  @IsString() @MaxLength(50)
  relation!: string;

  @IsString() @MaxLength(100)
  firstName!: string;

  @IsString() @MaxLength(100)
  lastName!: string;

  // REG-1 §2: guardian phone MANDATORY, Nepali mobile.
  @IsString() @MaxLength(20)
  @Matches(NEPAL_MOBILE_REGEX, { message: NEPAL_MOBILE_MESSAGE })
  phone!: string;

  // REG-1 §2: guardian email MANDATORY (credentials delivered to own email).
  @IsEmail()
  email!: string;

  @IsBoolean()
  isPrimary!: boolean;
}

/**
 * REG-1 §2 — a student registration must carry EXACTLY ONE primary guardian.
 * The "no primary provided" case (and the "several primaries" case) fail here
 * with 400; the DB partial unique index (0011) enforces at-most-one at write
 * time across all paths.
 */
@ValidatorConstraint({ name: 'exactlyOnePrimaryGuardian', async: false })
export class ExactlyOnePrimaryGuardianConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown): boolean {
    if (!Array.isArray(value) || value.length === 0) return false;
    return (
      value.filter(
        (g) => g && (g as GuardianInputDto).isPrimary === true,
      ).length === 1
    );
  }
  defaultMessage(): string {
    return 'a student must have exactly one primary guardian (guardians[].isPrimary = true)';
  }
}

export class AddressDto {
  @IsOptional() @IsString() province?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() municipality?: string;
  @IsOptional() @IsString() ward?: string;
  @IsOptional() @IsString() street?: string;
}

export class CreateStudentDto {
  @IsString() @MinLength(1) @MaxLength(100)
  firstName!: string;

  @IsString() @MinLength(1) @MaxLength(100)
  lastName!: string;

  @IsDateString()
  dateOfBirth!: string;

  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender!: string;

  @IsOptional() @IsString() @MaxLength(5)
  bloodGroup?: string;

  @IsOptional() @IsString() @MaxLength(50)
  religion?: string;

  @IsOptional() @IsString() @MaxLength(50)
  ethnicity?: string;

  @IsOptional() @IsString() @MaxLength(50)
  nationality?: string;

  @IsOptional() @IsString() @MaxLength(50)
  motherTongue?: string;

  // REG-1 §2: student contacts OPTIONAL, but validated (Nepali mobile) when given.
  @IsOptional() @IsString() @MaxLength(20)
  @Matches(NEPAL_MOBILE_REGEX, { message: NEPAL_MOBILE_MESSAGE })
  phone?: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  permanentAddress?: AddressDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  temporaryAddress?: AddressDto;

  // REG-1 §2: exactly one primary guardian REQUIRED at registration — no
  // @IsOptional, so an absent/empty guardians list fails validation (400). Typed
  // optional so programmatic callers that bypass the ValidationPipe (bulk import —
  // out of scope; seeds) still compile.
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuardianInputDto)
  @Validate(ExactlyOnePrimaryGuardianConstraint)
  guardians?: GuardianInputDto[];

  @IsOptional() @IsString() @MaxLength(50)
  className?: string;

  @IsOptional() @IsString() @MaxLength(50)
  sectionName?: string;

  @IsOptional() @IsInt() @Min(1)
  rollNumber?: number;

  @IsOptional() @IsUUID()
  classId?: string;

  @IsOptional() @IsUUID()
  sectionId?: string;

  @IsOptional() @IsUUID()
  academicYearId?: string;

  @IsDateString()
  admissionDate!: string;

  @IsOptional() @IsString() @MaxLength(20)
  academicYear?: string;

  @IsOptional() @IsString() @MaxLength(255)
  previousSchool?: string;

  /** Legacy base64 data-URI photo (deprecated — logged; use photoFileKey). */
  @IsOptional() @IsString()
  photoUrl?: string;

  /** FILE-1: storage key from POST /files/presign-upload (kind student-photo).
   *  Wins over photoUrl; HEAD-verified against the kind policy before persist. */
  @IsOptional() @IsString() @MaxLength(512)
  photoFileKey?: string;
}
