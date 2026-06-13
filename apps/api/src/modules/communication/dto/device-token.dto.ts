import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @Matches(/^ExponentPushToken\[.+\]$/, { message: 'token must be in ExponentPushToken[xxx] format' })
  token!: string;

  @IsIn(['ANDROID', 'IOS'])
  platform!: 'ANDROID' | 'IOS';

  @IsOptional()
  @IsString()
  deviceName?: string;
}

export interface DeviceTokenRow {
  id: string;
  user_id: string;
  token: string;
  platform: string;
  device_name: string | null;
  last_seen_at: Date;
  created_at: Date;
}
