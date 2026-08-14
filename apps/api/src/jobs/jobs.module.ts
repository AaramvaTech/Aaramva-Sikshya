import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ReconcileLedgerBalancesService } from './reconcile-ledger-balances.job';
import { LateFeeAccrualService } from './late-fee-accrual.job';
import { JobsController } from './jobs.controller';
import { FinanceModule } from '../modules/finance/finance.module';

/**
 * OPS-1 T4: BullMQ is gone — the fine cron was its only consumer and needs no
 * queue semantics. @nestjs/schedule runs in-process (no Redis), so this module
 * is imported UNCONDITIONALLY (the old conditional Redis gate was one of the
 * two layers of the silent-death bug).
 *
 * BILLING-CUTOVER Phase 4: `RecalculateFinesService` (old Finance's fine
 * cron, operating on the now-dropped `invoices`/`invoice_items` tables) is
 * removed — `LateFeeAccrualService` (BILL-7) is the Billing-rail equivalent
 * and was already running in parallel.
 */
@Module({
  imports: [ScheduleModule.forRoot(), FinanceModule],
  controllers: [JobsController],
  providers: [ReconcileLedgerBalancesService, LateFeeAccrualService],
})
export class JobsModule {}
