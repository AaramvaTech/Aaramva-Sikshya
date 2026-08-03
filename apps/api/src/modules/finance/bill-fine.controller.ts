import { Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { BillFineService } from './bill-fine.service';
import { BillFineRunQueryDto } from './dto/bill-fine.dto';

const ACCOUNTANT_AND_ABOVE = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT,
];
const OWNER_ONLY = [Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER];

/**
 * BILL-7-SPEC.md §5/§7 Checkpoint A. B7-6 ruling: manual trigger is
 * ACCOUNTANT_AND_ABOVE, not OWNER_ONLY — the run is fully idempotent
 * (B7-10) and reversible (B7-9), same risk tier as BILL-6's correction
 * *requests*. Reversal stays OWNER_ONLY, matching BILL-6's approve/reject/
 * reverse precedent (an owner decision to undo a posted fine).
 */
@Controller('finance/late-fees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillFineController {
  constructor(private readonly billFineService: BillFineService) {}

  @Post('run')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  run(@CurrentUser('userId') userId: string) {
    return this.billFineService.runLateFees('MANUAL', userId);
  }

  @Get('runs')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  findRuns(@Query() query: BillFineRunQueryDto) {
    return this.billFineService.findRuns(query);
  }

  @Post('accruals/:id/reverse')
  @Roles(...OWNER_ONLY)
  reverseAccrual(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return this.billFineService.reverseAccrual(id, userId);
  }
}
