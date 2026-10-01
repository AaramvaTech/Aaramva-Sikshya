import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../auth/auth.types';
import { CashierShiftService } from './cashier-shift.service';
import { OpenShiftDto, CloseShiftDto } from './dto/cashier-shift.dto';

const ACCOUNTANT_AND_ABOVE = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT,
];

/** BILL-9 Checkpoint B (§4). Separate controller — mirrors LedgerController's
 *  own split from BillPaymentController for a distinct sub-concern. */
@Controller('finance/cashier')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CashierController {
  constructor(private readonly cashierShiftService: CashierShiftService) {}

  @Post('shifts/open')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  openShift(@Body() dto: OpenShiftDto, @CurrentUser() user: AuthUser) {
    return this.cashierShiftService.openShift(dto, user.userId);
  }

  @Post('shifts/:id/close')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  closeShift(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseShiftDto, @CurrentUser() user: AuthUser) {
    return this.cashierShiftService.closeShift(id, dto, user.userId);
  }

  @Get('shifts/:id/payments')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  listShiftPayments(@Param('id', ParseUUIDPipe) id: string) {
    return this.cashierShiftService.listShiftPayments(id);
  }

  @Get('outside-shift-cash')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  outsideShiftCash(@CurrentUser() user: AuthUser, @Query('date') date?: string) {
    return this.cashierShiftService.outsideShiftCash(user.userId, date);
  }

  @Get('shifts')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  listShifts(@Query('cashierId') cashierId?: string, @Query('date') date?: string, @Query('status') status?: string) {
    return this.cashierShiftService.listShifts({ cashierId, date, status });
  }
}
