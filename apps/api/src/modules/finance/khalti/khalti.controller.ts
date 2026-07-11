import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';
import type { AuthUser } from '../../auth/auth.types';
import { KhaltiService } from './khalti.service';
import { InitiateKhaltiPaymentDto } from '../dto/khalti.dto';

const PAYER_ROLES = [
  Role.PARENT,
  Role.PLATFORM_ADMIN,
  Role.SCHOOL_OWNER,
  Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR,
  Role.ACCOUNTANT,
];

/**
 * Authenticated Khalti endpoints (tenant-scoped via TenantMiddleware as
 * usual), mirroring EsewaController. PARENT callers are object-scoped in the
 * service to their own children's invoices/transactions.
 */
@Controller('finance/payments/khalti')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KhaltiController {
  constructor(private readonly khaltiService: KhaltiService) {}

  @Post('initiate')
  @Roles(...PAYER_ROLES)
  initiate(@Body() dto: InitiateKhaltiPaymentDto, @CurrentUser() user: AuthUser) {
    return this.khaltiService.initiate(dto, user);
  }

  /** Re-runs verification for stuck INITIATED rows — same idempotent transition. */
  @Get('status/:transactionUuid')
  @Roles(...PAYER_ROLES)
  getStatus(
    @Param('transactionUuid', ParseUUIDPipe) transactionUuid: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.khaltiService.getStatus(transactionUuid, user);
  }
}
