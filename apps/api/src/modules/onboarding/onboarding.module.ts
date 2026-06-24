import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [TenantModule], // TenantPrismaService + TenantContextService (PrismaService is @Global)
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
