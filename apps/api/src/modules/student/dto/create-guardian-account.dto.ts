import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateGuardianAccountDto {
  @IsEmail()
  email!: string;

  /**
   * MAIL-1: omitted = a strong temporary password is generated and emailed to
   * the guardian (fire-and-forget; only when a NEW user is created — linking an
   * existing PARENT account never touches its password). Provided = admin
   * hands it over personally, no email is sent.
   */
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
