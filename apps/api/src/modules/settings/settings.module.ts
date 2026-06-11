import { Module } from '@nestjs/common';
import { SuperAdminModule } from '../super-admin/super-admin.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [SuperAdminModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
