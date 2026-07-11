import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { EsewaService } from './esewa/esewa.service';
import { KhaltiService } from './khalti/khalti.service';

const PAYER_ROLES = [
  Role.PARENT,
  Role.PLATFORM_ADMIN,
  Role.SCHOOL_OWNER,
  Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR,
  Role.ACCOUNTANT,
];

/**
 * Which online gateways this server has configured (PAY-2 T3) — drives the
 * client's pay-button chooser. Enablement is env-derived and secret-free.
 *
 * Path is deliberately NOT under finance/payments/… — FinanceController's
 * `payments/:id` route would shadow `payments/gateways` (registration-order
 * dependent), so this lives at the collision-proof /finance/payment-gateways.
 */
@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentGatewaysController {
  constructor(
    private readonly esewaService: EsewaService,
    private readonly khaltiService: KhaltiService,
  ) {}

  @Get('payment-gateways')
  @Roles(...PAYER_ROLES)
  getGateways() {
    return {
      esewa: this.esewaService.enabled,
      khalti: this.khaltiService.enabled,
    };
  }
}
