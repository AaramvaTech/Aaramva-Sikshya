import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { AssignmentController } from './assignment.controller';
import { AssignmentService } from './assignment.service';
import { SubmissionService } from './submission.service';

/** EDU-1 assignments & homework (Phase B). TenantModule is @Global. */
@Module({
  imports: [StorageModule],
  controllers: [AssignmentController],
  providers: [AssignmentService, SubmissionService],
})
export class AssignmentModule {}
