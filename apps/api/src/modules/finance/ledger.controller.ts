import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../auth/auth.types';
import { LedgerService } from './ledger.service';
import { OpeningBalanceImportService } from './opening-balance-import.service';
import { OpeningBalanceImportDto, LedgerAdjustmentDto, LedgerQueryDto } from './dto/ledger.dto';

const OWNER_ONLY = [Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER];
const ACCOUNTANT_AND_ABOVE = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT,
];

/**
 * BILL-3 (Phase 4) ledger core. Separate controller from BillAssignmentController
 * (Phase 3) — a distinct concern, same modular-controller convention.
 *
 * BUGS-6: spec §7 writes opening-balance import as one path,
 * "POST /finance/ledger/opening-balances (dry-run + confirm)". Split into
 * two explicit sub-routes (/preview, /confirm) instead of one endpoint
 * toggled by a request flag — mirrors this codebase's own established
 * dry-run/confirm shape (students/import: POST .../preview + POST .../commit)
 * and avoids a single boolean flag being the only thing standing between a
 * preview call and a real ledger-affecting commit.
 */
@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LedgerController {
  constructor(
    private readonly ledgerService: LedgerService,
    private readonly openingBalanceImportService: OpeningBalanceImportService,
  ) {}

  @Post('ledger/opening-balances/preview')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  previewOpeningBalances(@Body() dto: OpeningBalanceImportDto) {
    return this.openingBalanceImportService.preview(dto);
  }

  @Post('ledger/opening-balances/confirm')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  confirmOpeningBalances(@Body() dto: OpeningBalanceImportDto, @CurrentUser('userId') userId: string) {
    return this.openingBalanceImportService.confirm(dto, userId);
  }

  @Post('ledger/adjustments')
  @Roles(...OWNER_ONLY)
  createAdjustment(@Body() dto: LedgerAdjustmentDto, @CurrentUser('userId') userId: string) {
    return this.ledgerService.adjustment(dto, userId);
  }

  @Post('ledger/entries/:id/reverse')
  @Roles(...OWNER_ONLY)
  reverseEntry(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return this.ledgerService.reverse(id, userId);
  }

  @Get('students/:studentId/ledger')
  @Roles(...ACCOUNTANT_AND_ABOVE, Role.PARENT)
  getStudentLedger(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: LedgerQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ledgerService.getStudentLedger(studentId, query, user.userId, user.role);
  }

  @Get('students/:studentId/balance')
  @Roles(...ACCOUNTANT_AND_ABOVE, Role.PARENT)
  getStudentBalance(@Param('studentId', ParseUUIDPipe) studentId: string, @CurrentUser() user: AuthUser) {
    return this.ledgerService.getBalance(studentId, user.userId, user.role);
  }

  /** BILL-9 B9-4: ACCOUNTANT_AND_ABOVE, or PARENT object-scoped to their own child (assertGuardianOwnsStudent). */
  @Get('students/:studentId/statement')
  @Roles(...ACCOUNTANT_AND_ABOVE, Role.PARENT)
  getStudentStatement(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ledgerService.getStatement(studentId, { from, to }, user.userId, user.role);
  }
}
