import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../auth/auth.types';
import { StudentAttendanceService } from './student-attendance.service';
import { StaffAttendanceService } from './staff-attendance.service';
import { LeaveService } from './leave.service';
import { BulkStudentAttendanceDto, GetAttendanceQueryDto, GetSectionReportQueryDto } from './dto/student-attendance.dto';
import { BulkStaffAttendanceDto, GetStaffAttendanceQueryDto } from './dto/staff-attendance.dto';
import { ApplyLeaveDto, GetLeaveQueryDto, ReviewLeaveDto } from './dto/leave.dto';

const TEACHER_AND_ABOVE = [
  Role.PLATFORM_ADMIN,
  Role.SCHOOL_OWNER,
  Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR,
  Role.TEACHER,
];

const PRINCIPAL_AND_ABOVE = [
  Role.PLATFORM_ADMIN,
  Role.SCHOOL_OWNER,
  Role.PRINCIPAL,
];

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(
    private readonly studentAttendanceService: StudentAttendanceService,
    private readonly staffAttendanceService: StaffAttendanceService,
    private readonly leaveService: LeaveService,
  ) {}

  // ─── Student Attendance ────────────────────────────────────────────────────

  @Post('students/bulk')
  @Roles(...TEACHER_AND_ABOVE)
  markStudentAttendance(
    @Body() dto: BulkStudentAttendanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.studentAttendanceService.bulkMark(dto, user.userId);
  }

  @Get('students/school/summary')
  @Roles(...PRINCIPAL_AND_ABOVE)
  getSchoolSummary() {
    return this.studentAttendanceService.getSchoolSummary();
  }

  @Get('students/section/:sectionId/report')
  @Roles(...TEACHER_AND_ABOVE)
  getSectionReport(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Query() query: GetSectionReportQueryDto,
  ) {
    return this.studentAttendanceService.getSectionReport(sectionId, query);
  }

  @Get('students/:studentId/summary')
  @Roles(...TEACHER_AND_ABOVE)
  getStudentSummary(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('academicYearId', ParseUUIDPipe) academicYearId: string,
  ) {
    return this.studentAttendanceService.getStudentSummary(studentId, academicYearId);
  }

  @Get('students')
  @Roles(...TEACHER_AND_ABOVE)
  getStudentAttendance(@Query() query: GetAttendanceQueryDto) {
    return this.studentAttendanceService.getByQuery(query);
  }

  // ─── Staff Attendance ──────────────────────────────────────────────────────

  @Post('staff/bulk')
  @Roles(Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR, Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER)
  markStaffAttendance(
    @Body() dto: BulkStaffAttendanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.staffAttendanceService.bulkMark(dto, user.userId);
  }

  @Get('staff/:userId/summary')
  @Roles(...PRINCIPAL_AND_ABOVE)
  getStaffSummary(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.staffAttendanceService.getStaffSummary(userId, year, month);
  }

  @Get('staff')
  @Roles(...PRINCIPAL_AND_ABOVE)
  getStaffAttendance(@Query() query: GetStaffAttendanceQueryDto) {
    return this.staffAttendanceService.getByQuery(query);
  }

  // ─── Leave Applications ────────────────────────────────────────────────────

  @Post('leave')
  @Roles(
    Role.PARENT,
    Role.STUDENT,
    ...TEACHER_AND_ABOVE,
  )
  applyLeave(@Body() dto: ApplyLeaveDto, @CurrentUser() user: AuthUser) {
    return this.leaveService.applyLeave(dto, user.userId);
  }

  @Get('leave')
  @Roles(...TEACHER_AND_ABOVE)
  getLeave(@Query() query: GetLeaveQueryDto) {
    return this.leaveService.getByQuery(query);
  }

  @Patch('leave/:id/review')
  @Roles(Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR, Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER)
  reviewLeave(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewLeaveDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.leaveService.reviewLeave(id, dto, user.userId);
  }
}
