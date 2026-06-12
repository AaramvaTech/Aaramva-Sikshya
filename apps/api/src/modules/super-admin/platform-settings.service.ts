import { Injectable } from '@nestjs/common';
import { PublicPrismaService } from './public-prisma.service';

const KEYS = ['platformName', 'defaultTrialDays', 'smsSenderId', 'primaryColor'] as const;

export class PlatformSettingsDto {
  platformName?: string;
  defaultTrialDays?: number;
  smsSenderId?: string;
  primaryColor?: string;
}

@Injectable()
export class PlatformSettingsService {
  constructor(private readonly publicPrisma: PublicPrismaService) {}

  async getSettings() {
    const rows = await this.publicPrisma.query<{ key: string; value: string }>(
      `SELECT key, value FROM platform_configs WHERE key = ANY($1::text[])`,
      KEYS,
    );
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      platformName: map.platformName ?? 'Aaramva Shikshya',
      defaultTrialDays: parseInt(map.defaultTrialDays ?? '30', 10),
      smsSenderId: map.smsSenderId ?? 'Aaramva',
      primaryColor: map.primaryColor ?? '#1A5C38',
    };
  }

  async updateSettings(dto: PlatformSettingsDto) {
    const updates: { key: string; value: string }[] = [];
    if (dto.platformName !== undefined) updates.push({ key: 'platformName', value: dto.platformName });
    if (dto.defaultTrialDays !== undefined) updates.push({ key: 'defaultTrialDays', value: String(dto.defaultTrialDays) });
    if (dto.smsSenderId !== undefined) updates.push({ key: 'smsSenderId', value: dto.smsSenderId });
    if (dto.primaryColor !== undefined) updates.push({ key: 'primaryColor', value: dto.primaryColor });

    for (const { key, value } of updates) {
      await this.publicPrisma.execute(
        `INSERT INTO platform_configs (key, value, "updatedAt") VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
        key,
        value,
      );
    }

    return this.getSettings();
  }
}
