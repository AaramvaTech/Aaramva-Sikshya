// apps/api/src/modules/auth/dto/mobile-refresh.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';

export class MobileRefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
