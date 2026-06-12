// apps/api/src/modules/auth/dto/mobile-logout.dto.ts
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class MobileLogoutDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;

  @IsString()
  @IsOptional()
  expoPushToken?: string;
}
