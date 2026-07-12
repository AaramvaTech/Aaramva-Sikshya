import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { BrandingModule } from '../branding/branding.module';
import { SuperAdminModule } from '../super-admin/super-admin.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [SuperAdminModule, BrandingModule, StorageModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
