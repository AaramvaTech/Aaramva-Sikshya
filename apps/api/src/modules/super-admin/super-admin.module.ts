import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PublicPrismaService } from './public-prisma.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { PlatformAuthService } from './platform-auth.service';
import { PlanService } from './plan.service';
import { AuditService } from './audit.service';
import { TenantAdminService } from './tenant-admin.service';
import { ImpersonationService } from './impersonation.service';
import { AnalyticsService } from './analytics.service';
import { PlatformSettingsService } from './platform-settings.service';
import { SuperAdminController } from './super-admin.controller';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
  ],
  controllers: [SuperAdminController],
  providers: [
    PublicPrismaService,
    TenantProvisioningService,
    PlatformAuthService,
    PlanService,
    AuditService,
    TenantAdminService,
    ImpersonationService,
    AnalyticsService,
    PlatformSettingsService,
  ],
  exports: [TenantProvisioningService, PublicPrismaService],
})
export class SuperAdminModule {}
