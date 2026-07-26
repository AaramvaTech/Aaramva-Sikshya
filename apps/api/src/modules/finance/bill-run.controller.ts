import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { BillRunService } from './bill-run.service';
import {
  CreateBillRunDto, BillRunQueryDto, BillRunLineQueryDto, ExcludeBillRunLinesDto,
} from './dto/bill-run.dto';

const ACCOUNTANT_AND_ABOVE = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT,
];

/**
 * BILL-4 Checkpoints A + B + C: draft generation, read, post, exclude, and
 * void. No regenerate endpoint (not named as required by any checkpoint's
 * live proof — draft edits happen via a fresh draft after voiding).
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

  @Patch(':id/exclude')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  excludeLines(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ExcludeBillRunLinesDto) {
    return this.billRunService.excludeLines(id, dto.studentIds);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(...ACCOUNTANT_AND_ABOVE)
  voidRun(@Param('id', ParseUUIDPipe) id: string) {
    return this.billRunService.voidRun(id);
  }
}
