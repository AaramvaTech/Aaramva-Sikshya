import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { OnboardingService } from './onboarding.service';

// Setup is an owner/leadership task.
const SETUP_ROLES = [
  Role.PLATFORM_ADMIN,
  Role.SCHOOL_OWNER,
  Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR,
];

@Controller('onboarding')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('status')
  @Roles(...SETUP_ROLES)
  getStatus() {
    return this.onboardingService.getStatus();
  }

  @Post('complete')
  @Roles(...SETUP_ROLES)
  complete() {
    return this.onboardingService.complete();
  }
}
