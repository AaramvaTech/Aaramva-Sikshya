import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { ExaminationController } from './examination.controller';
import { GradingScaleService } from './grading-scale.service';
import { ExamTypeService } from './exam-type.service';
import { ExamScheduleService } from './exam-schedule.service';
import { MarksService } from './marks.service';
import { ResultService } from './result.service';

@Module({
  imports: [TenantModule],
  controllers: [ExaminationController],
  providers: [
    GradingScaleService,
    ExamTypeService,
    ExamScheduleService,
    MarksService,
    ResultService,
  ],
  exports: [GradingScaleService, ResultService],
})
export class ExaminationModule {}
