import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { FinanceSettingsService } from './finance-settings.service';
import { UpdateFinanceSettingsDto } from './dto/finance-settings.dto';

const OWNER_ONLY = [Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER];
const ACCOUNTANT_AND_ABOVE = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT,
];

/** BILL-4 Checkpoint C: R13's reset-per-fiscal-year toggle. Write is
 * OWNER_ONLY — it affects invoice-numbering integrity, same sensitivity
 * tier as ledger adjustments/reversals in this module. */
@Controller('finance/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceSettingsController {
  constructor(private readonly financeSettingsService: FinanceSettingsService) {}

  @Get()
  @Roles(...ACCOUNTANT_AND_ABOVE)
  get() {
    return this.financeSettingsService.getInvoiceNumberingReset();
  }

  @Patch()
  @Roles(...OWNER_ONLY)
  update(@Body() dto: UpdateFinanceSettingsDto) {
    return this.financeSettingsService.setInvoiceNumberingReset(dto.invoiceNumberingReset);
  }
}
