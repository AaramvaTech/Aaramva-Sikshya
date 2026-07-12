import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AttendanceReportService } from './attendance-report.service';
import { ExamReportService } from './exam-report.service';
import { FeeAgingReportService } from './fee-aging-report.service';

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
}
