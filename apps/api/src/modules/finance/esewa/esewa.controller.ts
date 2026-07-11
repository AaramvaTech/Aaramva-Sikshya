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
import { EsewaService } from './esewa.service';
import { InitiateEsewaPaymentDto } from '../dto/esewa.dto';

const PAYER_ROLES = [
  Role.PARENT,
  Role.PLATFORM_ADMIN,
  Role.SCHOOL_OWNER,
  Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR,
  Role.ACCOUNTANT,
];

/**
 * Authenticated eSewa endpoints (tenant-scoped via TenantMiddleware as usual).
 * PARENT callers are object-scoped in the service to their own children's
 * invoices/transactions.
 */
@Controller('finance/payments/esewa')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EsewaController {
  constructor(private readonly esewaService: EsewaService) {}

  @Post('initiate')
  @Roles(...PAYER_ROLES)
  initiate(@Body() dto: InitiateEsewaPaymentDto, @CurrentUser() user: AuthUser) {
    return this.esewaService.initiate(dto, user);
  }

  /** Re-runs verification for stuck INITIATED rows — same idempotent transition. */
  @Get('status/:transactionUuid')
  @Roles(...PAYER_ROLES)
  getStatus(
    @Param('transactionUuid', ParseUUIDPipe) transactionUuid: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.esewaService.getStatus(transactionUuid, user);
  }
}
