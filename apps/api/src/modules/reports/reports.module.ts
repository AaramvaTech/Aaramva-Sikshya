import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { AttendanceReportService } from './attendance-report.service';
import { ExamReportService } from './exam-report.service';
import { FeeAgingReportService } from './fee-aging-report.service';
import { DaybookReportService } from './daybook-report.service';
import { DefaultersReportService } from './defaulters-report.service';
import { CollectionReportService } from './collection-report.service';
import { FinesReportService } from './fines-report.service';

/** REP-1 + BILL-9 Checkpoint A + BILL-7 Checkpoint B — read-only cross-module
 *  analytics. No tables, no migrations here (reads bill_fine_accruals, which
 *  BILL-7 Checkpoint A already created). */
@Module({
  controllers: [ReportsController],
  providers: [
    AttendanceReportService,
    ExamReportService,
    FeeAgingReportService,
    DaybookReportService,
    DefaultersReportService,
    CollectionReportService,
    FinesReportService,
  ],
})
export class ReportsModule {}
