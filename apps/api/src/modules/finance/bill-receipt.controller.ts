import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../auth/auth.types';
import { BillReceiptDocumentService } from './bill-receipt-document.service';

const ACCOUNTANT_AND_ABOVE = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT,
];

/** BILL-8 Checkpoint B (spec §5): generate-or-fetch an 80mm thermal receipt
 * PDF, presigned link. B8-10: PARENT is object-scoped to their own child,
 * enforced inside BillReceiptDocumentService via
 * BillPaymentService.findOne's existing hard-scope. */
@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillReceiptController {
  constructor(private readonly billReceiptDocumentService: BillReceiptDocumentService) {}

  @Get('bill/payments/:id/receipt')
  @Roles(...ACCOUNTANT_AND_ABOVE, Role.PARENT)
  getReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Query('lang') lang?: string,
  ) {
    // B8-5 §5: staff-only language override, same restriction as the bill.
    const isStaff = ACCOUNTANT_AND_ABOVE.includes(user.role);
    return this.billReceiptDocumentService.getOrGenerateReceiptPdf(
      id, user.userId, user.role, isStaff ? lang : undefined,
    );
  }
}
