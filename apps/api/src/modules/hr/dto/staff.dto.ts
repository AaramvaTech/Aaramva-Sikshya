import {
  IsEmail, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional,
  IsString, IsUUID, Matches, MaxLength, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NEPAL_MOBILE_REGEX } from '../../common/utils/phone.util';

// REG-1 §2: Nepali mobile, validated on input, stored E.164 (+977…) by the service.
const NEPAL_MOBILE_MESSAGE =
  'phone must be a valid Nepali mobile number (9 followed by 6/7/8 and 8 digits)';

export enum EmploymentType {
  PERMANENT = 'PERMANENT',
  TEMPORARY = 'TEMPORARY',
  PART_TIME = 'PART_TIME',
  CONTRACT = 'CONTRACT',
}

const STAFF_ROLES = ['SCHOOL_OWNER', 'PRINCIPAL', 'ACADEMIC_COORDINATOR', 'ACCOUNTANT', 'LIBRARIAN', 'TEACHER'];

export class CreateStaffDto {
  @IsEmail()
  email: string;

  // MAIL-1: omitted = temp password generated + emailed; provided = no email.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  password?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @IsString()
  @IsIn(STAFF_ROLES)
  role: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  designationId?: string;

  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender?: string;

  // REG-1 §2: staff phone is MANDATORY at the HTTP boundary — no @IsOptional, so
  // an absent phone fails validation (400). Typed optional so internal callers
  // that bypass the ValidationPipe (seeds/tests) still compile; the service
  // stores it in E.164 (+977…).
  @IsString()
  @Matches(NEPAL_MOBILE_REGEX, { message: NEPAL_MOBILE_MESSAGE })
  phone?: string;

  @IsString()
  @IsNotEmpty()
  joinDate: string;

  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @IsNumber()
  @Min(0)
  baseSalary: number;

  @IsOptional()
  @IsString()
  panNumber?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bankAccount?: string;

  @IsOptional()
  @IsString()
  permanentAddress?: string;

  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;
}

export class UpdateStaffDto {
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  designationId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseSalary?: number;

  @IsOptional()
  @IsString()
  panNumber?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bankAccount?: string;

  @IsOptional()
  @IsString()
  permanentAddress?: string;

  @IsOptional()
  @IsString()
  temporaryAddress?: string;

  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  /** Legacy base64 data-URI photo (deprecated — logged; use photoFileKey). */
  @IsOptional()
  @IsString()
  photoUrl?: string;

  /** FILE-1: storage key (kind staff-photo). Wins over photoUrl. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  photoFileKey?: string;
}

export class StaffQueryDto {
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
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder?: string;
}

export class AddStaffDocumentDto {
  @IsString()
  @IsNotEmpty()
  documentType: string;

  /** Legacy base64 data-URI document (deprecated — logged; use fileKey).
   *  Exactly one of fileUrl | fileKey is required (service-enforced). */
  @IsOptional()
  @IsString()
  fileUrl?: string;

  /** FILE-1: storage key (kind staff-document). Wins over fileUrl. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  fileKey?: string;

  @IsOptional()
  @IsString()
  fileName?: string;
}
