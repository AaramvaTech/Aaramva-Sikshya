import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { BrandingModule } from '../branding/branding.module';
import { StorageModule } from '../storage/storage.module';
import { CredentialDeliveryModule } from '../credential-delivery/credential-delivery.module';
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
    BrandingModule,
    StorageModule,
    CredentialDeliveryModule, // REG-1: owner credential delivery via the tenant ledger
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
