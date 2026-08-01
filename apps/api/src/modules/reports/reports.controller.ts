import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AttendanceReportService } from './attendance-report.service';
import { ExamReportService } from './exam-report.service';
import { FeeAgingReportService } from './fee-aging-report.service';
import { DaybookReportService } from './daybook-report.service';
import { DefaultersReportService } from './defaulters-report.service';
import { CollectionReportService } from './collection-report.service';

/** REP-1 roles (spec-fixed): attendance + exams → principal tier + academic
 *  coordinator; fee aging additionally opens to ACCOUNTANT. */
const ACADEMIC_REPORT_ROLES = [
  Role.PLATFORM_ADMIN,
  Role.SCHOOL_OWNER,
  Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR,
];
const FINANCE_REPORT_ROLES = [...ACADEMIC_REPORT_ROLES, Role.ACCOUNTANT];

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(
    private readonly attendanceReports: AttendanceReportService,
    private readonly examReports: ExamReportService,
    private readonly feeAgingReports: FeeAgingReportService,
    private readonly daybookReports: DaybookReportService,
    private readonly defaultersReports: DefaultersReportService,
    private readonly collectionReports: CollectionReportService,
  ) {}

  // ─── T1 Attendance ──────────────────────────────────────────────────────────

  @Get('attendance/trends')
  @Roles(...ACADEMIC_REPORT_ROLES)
  getAttendanceTrends(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('classId') classId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('groupBy') groupBy?: string,
  ) {
    return this.attendanceReports.getTrends({ from, to, classId, sectionId, groupBy });
  }

  @Get('attendance/class-comparison/:classId')
  @Roles(...ACADEMIC_REPORT_ROLES)
  getClassComparison(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attendanceReports.getClassComparison({ classId, from, to });
  }

  @Get('attendance/low')
  @Roles(...ACADEMIC_REPORT_ROLES)
  getLowAttendance(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('classId') classId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('threshold') threshold?: string,
  ) {
    return this.attendanceReports.getLowAttendance({
      from,
      to,
      classId,
      sectionId,
      threshold: threshold ? Number(threshold) : undefined,
    });
  }

  @Get('attendance/staff')
  @Roles(...ACADEMIC_REPORT_ROLES)
  getStaffSummary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.attendanceReports.getStaffSummary({ from, to });
  }

  // ─── T2 Exams (published-only) ──────────────────────────────────────────────

  @Get('exams/published')
  @Roles(...ACADEMIC_REPORT_ROLES)
  listPublishedExams(@Query('academicYearId') academicYearId?: string) {
    return this.examReports.listPublishedExams(academicYearId);
  }

  @Get('exams/summary/:examTypeId')
  @Roles(...ACADEMIC_REPORT_ROLES)
  getExamSummary(
    @Param('examTypeId', ParseUUIDPipe) examTypeId: string,
    @Query('classId') classId?: string,
  ) {
    return this.examReports.getSummary(examTypeId, classId);
  }

  @Get('exams/comparison/:examTypeId')
  @Roles(...ACADEMIC_REPORT_ROLES)
  getExamComparison(@Param('examTypeId', ParseUUIDPipe) examTypeId: string) {
    return this.examReports.getComparison(examTypeId);
  }

  @Get('exams/student-progress/:studentId')
  @Roles(...ACADEMIC_REPORT_ROLES)
  getStudentProgress(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.examReports.getStudentProgress(studentId, academicYearId);
  }

  // ─── T3 Fee aging (ACCOUNTANT included) ─────────────────────────────────────

  @Get('finance/aging')
  @Roles(...FINANCE_REPORT_ROLES)
  getFeeAging(@Query('asOf') asOf?: string, @Query('classId') classId?: string) {
    return this.feeAgingReports.getAging({ asOf, classId });
  }

  // ─── BILL-9 Checkpoint A ─────────────────────────────────────────────────────
  // B9-4: daybook + collection are "operational reports" (ACCOUNTANT_AND_ABOVE);
  // defaulters joins aging under the same finance-report roles. Both role sets
  // are identical (PLATFORM_ADMIN/SCHOOL_OWNER/PRINCIPAL/ACADEMIC_COORDINATOR/
  // ACCOUNTANT) — FINANCE_REPORT_ROLES already names it. Mounted here, not on
  // FinanceController, to avoid colliding with that controller's existing
  // old-rail /finance/reports/collection and /finance/reports/defaulters
  // routes (report.service.ts, still live for finance/page.tsx et al) —
  // logged in BILL-BUGS.md.

  @Get('finance/daybook')
  @Roles(...FINANCE_REPORT_ROLES)
  getDaybook(@Query('bsDate') bsDate?: string) {
    return this.daybookReports.getDaybook({ bsDate });
  }

  @Get('finance/defaulters')
  @Roles(...FINANCE_REPORT_ROLES)
  getFinanceDefaulters(
    @Query('classId') classId?: string,
    @Query('minBalance') minBalance?: string,
    @Query('sort') sort?: string,
  ) {
    return this.defaultersReports.getDefaulters({ classId, minBalance, sort });
  }

  @Get('finance/collection')
  @Roles(...FINANCE_REPORT_ROLES)
  getCollectionSummary(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('groupBy') groupBy?: string,
  ) {
    return this.collectionReports.getCollection({ from, to, groupBy });
  }
}
