import { Global, Module } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';
import { TenantMiddleware } from './tenant.middleware';
import { TenantPrismaService } from './tenant-prisma.service';
import { TenantService } from './tenant.service';
import { TenantMigrationService } from './tenant-migration.service';
import { TenantController } from './tenant.controller';

/**
 * Global so TenantContextService / TenantPrismaService / TenantService /
 * TenantMigrationService can be injected by any feature module (auth, student,
 * provisioning, ...) without re-importing.
 * Middleware registration (with super-admin exclusion) is in AppModule.
 */
@Global()
@Module({
  controllers: [TenantController],
  providers: [
    TenantService,
    TenantContextService,
    TenantPrismaService,
    TenantMigrationService,
    TenantMiddleware,
  ],
  exports: [
    TenantService,
    TenantContextService,
    TenantPrismaService,
    TenantMigrationService,
    TenantMiddleware,
  ],
})
export class TenantModule {}
