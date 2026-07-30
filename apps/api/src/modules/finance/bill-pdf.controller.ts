import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../auth/auth.types';
import { BillDocumentService } from './bill-document.service';

const ACCOUNTANT_AND_ABOVE = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT,
];

/** BILL-8 Checkpoint A (spec §5): generate-or-fetch a bill PDF, presigned
 * link. B8-10: PARENT is object-scoped to their own child — enforced inside
 * BillDocumentService via BillInvoiceService.findOne's existing hard-scope. */
@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillPdfController {
  constructor(private readonly billDocumentService: BillDocumentService) {}

  @Get('bill/invoices/:id/pdf')
  @Roles(...ACCOUNTANT_AND_ABOVE, Role.PARENT)
  getBillPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Query('lang') lang?: string,
  ) {
    // B8-5 §5: the language query override is staff-only — a PARENT's
    // request always uses the tenant's own resolved default, never a
    // caller-supplied value (BillDocumentService's gate check would reject
    // an unreviewed language anyway, but this keeps the override's scope
    // matching the spec even once the gate opens).
    const isStaff = ACCOUNTANT_AND_ABOVE.includes(user.role);
    return this.billDocumentService.getOrGenerateBillPdf(id, user.userId, user.role, isStaff ? lang : undefined);
  }
}
