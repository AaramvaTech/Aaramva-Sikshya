import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { DeviceTokenRow, RegisterDeviceDto } from './dto/device-token.dto';

@Injectable()
export class DeviceTokenService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async register(userId: string, dto: RegisterDeviceDto) {
    const rows = await this.tenantPrisma.query<DeviceTokenRow>(
      `INSERT INTO device_tokens (user_id, token, platform, device_name, last_seen_at)
       VALUES ($1::uuid, $2, $3, $4, NOW())
       ON CONFLICT (token) DO UPDATE
         SET user_id      = EXCLUDED.user_id,
             platform     = EXCLUDED.platform,
             device_name  = EXCLUDED.device_name,
             last_seen_at = NOW()
       RETURNING *`,
      userId,
      dto.token,
      dto.platform,
      dto.deviceName ?? null,
    );
    const row = rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      token: row.token,
      platform: row.platform,
      deviceName: row.device_name,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
    };
  }

  async remove(userId: string, token: string): Promise<void> {
    const affected = await this.tenantPrisma.execute(
      `DELETE FROM device_tokens WHERE token = $1 AND user_id = $2::uuid`,
      token,
      userId,
    );
    if (affected === 0) throw new NotFoundException('Device token not found');
  }
}
