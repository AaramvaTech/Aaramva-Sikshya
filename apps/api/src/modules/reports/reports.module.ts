import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { AttendanceReportService } from './attendance-report.service';
import { ExamReportService } from './exam-report.service';
import { FeeAgingReportService } from './fee-aging-report.service';
import { DaybookReportService } from './daybook-report.service';
import { DefaultersReportService } from './defaulters-report.service';
import { CollectionReportService } from './collection-report.service';

/** REP-1 + BILL-9 Checkpoint A — read-only cross-module analytics. No
 *  tables, no migrations (BILL-9's own cashier-close storage lives in the
 *  finance module, Checkpoint B). */
@Module({
  controllers: [ReportsController],
  providers: [
    AttendanceReportService,
    ExamReportService,
    FeeAgingReportService,
    DaybookReportService,
    DefaultersReportService,
    CollectionReportService,
  ],
})
export class ReportsModule {}
