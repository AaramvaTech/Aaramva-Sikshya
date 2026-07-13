import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule], // BUG-1: /health probes storage reachability
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
