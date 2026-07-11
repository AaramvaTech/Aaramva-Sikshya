import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class PlatformLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}

export class PlatformChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  // Platform admin controls every school — hold it to a higher bar.
  @IsString()
  @MinLength(12)
  newPassword!: string;
}
