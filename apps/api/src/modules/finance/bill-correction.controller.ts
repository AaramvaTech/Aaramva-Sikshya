import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../auth/auth.types';
import { BillCorrectionService } from './bill-correction.service';
import {
  BillCorrectionQueryDto, CreateCreditNoteDto, CreateRefundDto, CreateWriteOffDto, DecideCorrectionDto,
} from './dto/bill-correction.dto';

const ACCOUNTANT_AND_ABOVE = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT,
];
const OWNER_ONLY = [Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER];

/**
 * BILL-6-SPEC.md §5. Requests are ACCOUNTANT_AND_ABOVE; approve/reject/
 * reverse are OWNER_ONLY (B6-4) and already handle all three types
 * generically (BillCorrectionService.approve dispatches by
 * correction.type) — no route churn needed between Checkpoint A and B.
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

  @Post('refunds')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  requestRefund(@Body() dto: CreateRefundDto, @CurrentUser('userId') userId: string) {
    return this.billCorrectionService.requestRefund(dto, userId);
  }

  @Post('write-offs')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  requestWriteOff(@Body() dto: CreateWriteOffDto, @CurrentUser('userId') userId: string) {
    return this.billCorrectionService.requestWriteOff(dto, userId);
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
