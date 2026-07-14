import { Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { CredentialDeliveryService } from './credential-delivery.service';

/**
 * REG-1 §5 — POST /users/:id/resend-credentials (tenant admin). Generates a fresh
 * temp password, invalidates the old hash, re-sets must_change_password, and
 * enqueues new deliveries. No platform variant (REG-OBS-2).
 */
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
export class UserCredentialController {
  constructor(private readonly delivery: CredentialDeliveryService) {}

  @Post(':id/resend-credentials')
  resend(@Param('id', ParseUUIDPipe) id: string) {
    return this.delivery.resendForUser(id);
  }
}
