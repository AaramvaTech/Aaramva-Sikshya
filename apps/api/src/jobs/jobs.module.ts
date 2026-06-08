import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { RecalculateFinesProcessor, RecalculateFinesScheduler } from './recalculate-fines.job';
import { FinanceModule } from '../modules/finance/finance.module';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          enableReadyCheck: false,
          maxRetriesPerRequest: null,
          // Cap reconnect attempts to once per 30s so dev logs stay quiet when Redis is down
          retryStrategy: (times: number) => Math.min(times * 1000, 30000),
        },
      }),
    }),
    BullModule.registerQueue({ name: 'recalculate-fines' }),
    FinanceModule,
  ],
  providers: [RecalculateFinesScheduler, RecalculateFinesProcessor],
})
export class JobsModule {}
