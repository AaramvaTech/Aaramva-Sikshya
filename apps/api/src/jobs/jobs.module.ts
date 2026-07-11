import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RecalculateFinesService } from './recalculate-fines.job';
import { JobsController } from './jobs.controller';
import { FinanceModule } from '../modules/finance/finance.module';

/**
 * OPS-1 T4: BullMQ is gone — the fine cron was its only consumer and needs no
 * queue semantics. @nestjs/schedule runs in-process (no Redis), so this module
 * is imported UNCONDITIONALLY (the old conditional Redis gate was one of the
 * two layers of the silent-death bug).
 */
@Module({
  imports: [ScheduleModule.forRoot(), FinanceModule],
  controllers: [JobsController],
  providers: [RecalculateFinesService],
})
export class JobsModule {}
