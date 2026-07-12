import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { AttendanceReportService } from './attendance-report.service';
import { ExamReportService } from './exam-report.service';
import { FeeAgingReportService } from './fee-aging-report.service';

/** REP-1 — read-only cross-module analytics. No tables, no migrations. */
@Module({
  controllers: [ReportsController],
  providers: [AttendanceReportService, ExamReportService, FeeAgingReportService],
})
export class ReportsModule {}
