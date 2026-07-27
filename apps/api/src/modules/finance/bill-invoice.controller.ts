import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../auth/auth.types';
import { BillInvoiceService } from './bill-invoice.service';
import { BillInvoiceQueryDto } from './dto/bill-invoice.dto';

const ACCOUNTANT_AND_ABOVE = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT,
];

/** BILL-4 Checkpoint C read endpoints (spec §5). Static `students/:studentId/bill/invoices`
 * route lives on this same controller — no shadowing risk with `bill/invoices/:id`
 * since the path prefixes differ (`students/...` vs `bill/invoices/...`). */
@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillInvoiceController {
  constructor(private readonly billInvoiceService: BillInvoiceService) {}

  @Get('bill/invoices')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  findAll(@Query() query: BillInvoiceQueryDto) {
    return this.billInvoiceService.findAll(query);
  }

  @Get('bill/invoices/:id')
  @Roles(...ACCOUNTANT_AND_ABOVE, Role.PARENT)
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.billInvoiceService.findOne(id, user.userId, user.role);
  }

  @Get('students/:studentId/bill/invoices')
  @Roles(...ACCOUNTANT_AND_ABOVE, Role.PARENT)
  findByStudent(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: BillInvoiceQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.billInvoiceService.findByStudent(studentId, query, user.userId, user.role);
  }
}
