import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { PublicPrismaService } from '../super-admin/public-prisma.service';
import { CredentialDeliveryService } from './credential-delivery.service';
import { CredentialDeliveryPoller } from './credential-delivery.poller';
import { CredentialDeliveryController } from './credential-delivery.controller';
import { UserCredentialController } from './user-credential.controller';

/**
 * REG-1 Phase 3 — credential-delivery outbox. TenantPrismaService /
 * TenantContextService / TenantService come from the @Global TenantModule;
 * PrismaService from the @Global PrismaModule; MailService from MailModule.
 * @nestjs/schedule is initialised app-wide (ScheduleModule.forRoot).
 */
@Module({
  imports: [MailModule],
  controllers: [CredentialDeliveryController, UserCredentialController],
  providers: [CredentialDeliveryService, CredentialDeliveryPoller, PublicPrismaService],
  exports: [CredentialDeliveryService],
})
export class CredentialDeliveryModule {}
