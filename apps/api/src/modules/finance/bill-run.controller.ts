import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { BillRunService } from './bill-run.service';
import { CreateBillRunDto, BillRunQueryDto, BillRunLineQueryDto } from './dto/bill-run.dto';

const ACCOUNTANT_AND_ABOVE = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT,
];

/**
 * BILL-4 Checkpoints A + B: draft generation, read, and post. No
 * regenerate/exclude/void endpoints yet (BILL-4-SPEC.md §7 Checkpoint C).
 */
@Controller('finance/bill/runs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillRunController {
  constructor(private readonly billRunService: BillRunService) {}

  @Post()
  @Roles(...ACCOUNTANT_AND_ABOVE)
  create(@Body() dto: CreateBillRunDto, @CurrentUser('userId') userId: string) {
    return this.billRunService.generateDraft(dto, userId);
  }

  @Get()
  @Roles(...ACCOUNTANT_AND_ABOVE)
  findAll(@Query() query: BillRunQueryDto) {
    return this.billRunService.findAll(query);
  }

  @Get(':id')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  findOne(@Param('id', ParseUUIDPipe) id: string, @Query() lineQuery: BillRunLineQueryDto) {
    return this.billRunService.findOne(id, lineQuery);
  }

  @Post(':id/post')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  requestPost(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string) {
    return this.billRunService.requestPost(id, userId);
  }
}
