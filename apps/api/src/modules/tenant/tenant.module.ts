import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';
import { TenantMiddleware } from './tenant.middleware';
import { TenantPrismaService } from './tenant-prisma.service';
import { TenantService } from './tenant.service';

/**
 * Global so TenantContextService / TenantPrismaService / TenantService can be
 * injected by any feature module (auth, student, ...) without re-importing.
 */
@Global()
@Module({
  providers: [TenantService, TenantContextService, TenantPrismaService],
  exports: [TenantService, TenantContextService, TenantPrismaService],
})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Applies to every route. register-school is bypassed inside the
    // middleware itself (see TenantMiddleware.PUBLIC_PATH_SUFFIXES).
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
