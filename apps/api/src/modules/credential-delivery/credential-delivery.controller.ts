import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { CredentialDeliveryService } from './credential-delivery.service';
import { ListDeliveriesQueryDto } from './dto/list-deliveries-query.dto';

/**
 * REG-1 §4 — admin ledger read + a manual drain trigger for the CURRENT tenant.
 * Tenant-admin only; the scheduled poller (CredentialDeliveryPoller) covers all
 * tenants automatically.
 */
@Controller('credential-deliveries')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
export class CredentialDeliveryController {
  constructor(private readonly delivery: CredentialDeliveryService) {}

  @Get()
  list(@Query() q: ListDeliveriesQueryDto) {
    return this.delivery.listForUser(q.userId);
  }

  @Post('run')
  run() {
    return this.delivery.drainCurrentTenant();
  }
}
