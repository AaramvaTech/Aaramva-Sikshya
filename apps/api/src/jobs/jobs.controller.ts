import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../modules/common/guards/jwt-auth.guard';
import { RolesGuard } from '../modules/common/guards/roles.guard';
import { Roles } from '../modules/common/decorators/roles.decorator';
import { Role } from '../modules/common/enums/role.enum';
import { ReconcileRunSummary, ReconcileLedgerBalancesService } from './reconcile-ledger-balances.job';
import { LateFeeAccrualRunSummary, LateFeeAccrualService } from './late-fee-accrual.job';

/**
 * Manual job triggers (OPS-1 T4). Lives under super-admin so it shares the
 * existing TenantMiddleware exclusion (cross-tenant work, no tenant context).
 *
 * BILLING-CUTOVER Phase 4: `recalculate-fines` (old Finance's fine cron
 * trigger) removed along with RecalculateFinesService.
 */
@Controller('super-admin/jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PLATFORM_ADMIN)
export class JobsController {
  constructor(
    private readonly ledgerReconciliation: ReconcileLedgerBalancesService,
    private readonly lateFeeAccrual: LateFeeAccrualService,
  ) {}

  @Post('reconcile-ledger-balances')
  @HttpCode(200)
  runLedgerReconciliation(): Promise<ReconcileRunSummary> {
    return this.ledgerReconciliation.run('manual');
  }

  @Post('late-fee-accrual')
  @HttpCode(200)
  runLateFeeAccrual(): Promise<LateFeeAccrualRunSummary> {
    return this.lateFeeAccrual.run('manual');
  }
}
