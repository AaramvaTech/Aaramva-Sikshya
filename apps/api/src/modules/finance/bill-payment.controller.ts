import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../auth/auth.types';
import { BillPaymentService } from './bill-payment.service';
import { BillPaymentAllocationMode, BillPaymentQueryDto, CreateBillPaymentDto } from './dto/bill-payment.dto';

const ACCOUNTANT_AND_ABOVE = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT,
];

/**
 * BILL-5-SPEC.md §5. B5-3's MANUAL-allocation "behind a permission" is
 * enforced HERE, not via @Roles() on the route (the base ACCOUNTANT_AND_ABOVE
 * gate already covers the whole endpoint; MANUAL depends on the request
 * BODY, which a declarative role guard can't discriminate on) — a plain
 * ACCOUNTANT posting AUTO_FIFO/ADVANCE_ONLY is fine, but MANUAL requires
 * PRINCIPAL_AND_ABOVE.
 */
const MANUAL_ALLOCATION_ROLES = [Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL];

@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillPaymentController {
  constructor(private readonly billPaymentService: BillPaymentService) {}

  @Post('bill/payments')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  recordPayment(@Body() dto: CreateBillPaymentDto, @CurrentUser() user: AuthUser) {
    if (dto.allocationMode === BillPaymentAllocationMode.MANUAL && !MANUAL_ALLOCATION_ROLES.includes(user.role)) {
      throw new ForbiddenException('MANUAL allocation requires PRINCIPAL role or above');
    }
    return this.billPaymentService.recordPayment(dto, user.userId);
  }

  @Get('bill/payments')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  findAll(@Query() query: BillPaymentQueryDto) {
    return this.billPaymentService.findAll(query);
  }

  @Get('bill/payments/:id')
  @Roles(...ACCOUNTANT_AND_ABOVE, Role.PARENT)
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.billPaymentService.findOne(id, user.userId, user.role);
  }
}
