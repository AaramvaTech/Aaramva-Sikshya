import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../auth/auth.types';
import { BillCorrectionService } from './bill-correction.service';
import { BillCorrectionQueryDto, CreateCreditNoteDto, DecideCorrectionDto } from './dto/bill-correction.dto';

const ACCOUNTANT_AND_ABOVE = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT,
];
const OWNER_ONLY = [Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER];

/**
 * BILL-6-SPEC.md §5 Checkpoint A. Requests are ACCOUNTANT_AND_ABOVE;
 * approve/reject/reverse are OWNER_ONLY (B6-4). Refund/write-off request
 * routes land in Checkpoint B — approve/reject/reverse here already handle
 * any type (BillCorrectionService.approve rejects non-CREDIT_NOTE types for
 * now), so this same controller extends cleanly without route churn.
 */
@Controller('finance/corrections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillCorrectionController {
  constructor(private readonly billCorrectionService: BillCorrectionService) {}

  @Post('credit-notes')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  requestCreditNote(@Body() dto: CreateCreditNoteDto, @CurrentUser('userId') userId: string) {
    return this.billCorrectionService.requestCreditNote(dto, userId);
  }

  @Get()
  @Roles(...ACCOUNTANT_AND_ABOVE, Role.PARENT)
  findAll(@Query() query: BillCorrectionQueryDto, @CurrentUser() user: AuthUser) {
    return this.billCorrectionService.findAll(query, user.userId, user.role);
  }

  @Get(':id')
  @Roles(...ACCOUNTANT_AND_ABOVE, Role.PARENT)
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.billCorrectionService.findOne(id, user.userId, user.role);
  }

  @Post(':id/approve')
  @Roles(...OWNER_ONLY)
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideCorrectionDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.billCorrectionService.approve(id, userId, dto);
  }

  @Post(':id/reject')
  @Roles(...OWNER_ONLY)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideCorrectionDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.billCorrectionService.reject(id, userId, dto);
  }

  @Post(':id/reverse')
  @Roles(...OWNER_ONLY)
  reverse(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return this.billCorrectionService.reverse(id, userId);
  }
}
