import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateStudentAccountDto {
  @IsEmail()
  email!: string;

  /**
   * MAIL-1: omitted = a strong temporary password is generated and emailed to
   * the student (fire-and-forget). Provided = admin hands it over personally,
   * no email is sent.
   */
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
