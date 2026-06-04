import {
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class GuardianDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() occupation?: string;
  @IsOptional() @IsEmail()  email?: string;
  @IsOptional() @IsString() relation?: string;
}

export class AddressDto {
  @IsOptional() @IsString() province?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() municipality?: string;
  @IsOptional() @IsString() ward?: string;
  @IsOptional() @IsString() street?: string;
}

export class GuardiansDto {
  @IsOptional() @IsObject() father?: GuardianDto;
  @IsOptional() @IsObject() mother?: GuardianDto;
  @IsOptional() @IsObject() localGuardian?: GuardianDto;
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

  @IsOptional() @IsObject()
  permanentAddress?: AddressDto;

  @IsOptional() @IsObject()
  temporaryAddress?: AddressDto;

  @IsOptional() @IsObject()
  guardians?: GuardiansDto;

  @IsOptional() @IsString() @MaxLength(50)
  className?: string;

  @IsOptional() @IsString() @MaxLength(50)
  sectionName?: string;

  @IsOptional() @IsInt() @Min(1)
  rollNumber?: number;

  @IsDateString()
  admissionDate!: string;

  @IsOptional() @IsString() @MaxLength(20)
  academicYear?: string;

  @IsOptional() @IsString() @MaxLength(255)
  previousSchool?: string;

  @IsOptional() @IsString()
  photoUrl?: string;
}
