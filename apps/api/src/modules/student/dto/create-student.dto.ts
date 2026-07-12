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
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GuardianInputDto {
  @IsString() @MaxLength(50)
  relation!: string;

  @IsString() @MaxLength(100)
  firstName!: string;

  @IsString() @MaxLength(100)
  lastName!: string;

  @IsString() @MaxLength(20)
  phone!: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsBoolean()
  isPrimary!: boolean;
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

  @IsOptional() @IsString() @MaxLength(20)
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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuardianInputDto)
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
