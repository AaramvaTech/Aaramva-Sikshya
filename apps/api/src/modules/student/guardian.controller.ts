import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { GuardianService } from './guardian.service';

/**
 * POL-1 T2 — guardian self-service. Same discipline as the /students/me
 * routes: no id params anywhere; everything resolves from the token.
 */
@Controller('guardians')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GuardianController {
  constructor(private readonly guardianService: GuardianService) {}

  @Get('me')
  @Roles(Role.PARENT)
  getMyProfile(@CurrentUser() user: AuthUser) {
    return this.guardianService.getMyProfile(user.userId);
  }
}
