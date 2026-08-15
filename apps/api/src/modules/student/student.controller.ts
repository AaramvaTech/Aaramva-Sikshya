import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { StudentService } from './student.service';
import { StudentMeService } from './student-me.service';
import { GuardianService } from './guardian.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { CreateStudentAccountDto } from './dto/create-student-account.dto';
import { CreateGuardianAccountDto } from './dto/create-guardian-account.dto';
import { ProvisionGuardianDto } from './dto/provision-guardian.dto';
import { EnrollStudentDto } from './dto/enroll-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { UpdateStudentStatusDto } from './dto/update-student-status.dto';
import { ListStudentsQueryDto } from './dto/list-students-query.dto';
import {
  StudentMeAttendanceSummaryDto,
  StudentMeAttendanceHistoryDto,
} from './dto/student-me-query.dto';

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentController {
  constructor(
    private readonly studentService: StudentService,
    private readonly studentMeService: StudentMeService,
    private readonly guardianService: GuardianService,
  ) {}

  @Post()
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  admitStudent(@Body() dto: CreateStudentDto, @CurrentUser() user: AuthUser) {
    return this.studentService.admitStudent(dto, user.userId);
  }

  @Get()
  @Roles(
    Role.SCHOOL_OWNER,
    Role.PRINCIPAL,
    Role.ACADEMIC_COORDINATOR,
    Role.TEACHER,
    Role.ACCOUNTANT,
    Role.LIBRARIAN,
  )
  findAll(@Query() query: ListStudentsQueryDto) {
    return this.studentService.findAll(query);
  }

  @Get('stats')
  @Roles(
    Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR,
    Role.ACCOUNTANT, Role.TEACHER,
  )
  getStats() {
    return this.studentService.getStats();
  }

  @Get('my-children')
  @Roles(Role.PARENT)
  getMyChildren(@CurrentUser() user: AuthUser) {
    return this.guardianService.getMyChildren(user.userId);
  }

  // ─── /me routes MUST come before /:id to avoid "me" matching as UUID ─────────

  @Get('me')
  @Roles(Role.STUDENT)
  getMyProfile(@CurrentUser() user: AuthUser) {
    return this.studentMeService.getMyProfile(user.userId);
  }

  @Get('me/timetable/today')
  @Roles(Role.STUDENT)
  getMyTodayTimetable(@CurrentUser() user: AuthUser) {
    return this.studentMeService.getMyTodayTimetable(user.userId);
  }

  @Get('me/attendance/summary')
  @Roles(Role.STUDENT)
  getMyAttendanceSummary(
    @CurrentUser() user: AuthUser,
    @Query() dto: StudentMeAttendanceSummaryDto,
  ) {
    return this.studentMeService.getMyAttendanceSummary(user.userId, dto);
  }

  @Get('me/attendance/history')
  @Roles(Role.STUDENT)
  getMyAttendanceHistory(
    @CurrentUser() user: AuthUser,
    @Query() dto: StudentMeAttendanceHistoryDto,
  ) {
    return this.studentMeService.getMyAttendanceHistory(user.userId, dto);
  }

  @Get('me/results')
  @Roles(Role.STUDENT)
  getMyResults(@CurrentUser() user: AuthUser) {
    return this.studentMeService.getMyResults(user.userId);
  }

  @Get('me/report-card')
  @Roles(Role.STUDENT)
  getMyReportCard(@CurrentUser() user: AuthUser) {
    return this.studentMeService.getMyReportCard(user.userId);
  }

  @Get('me/report-card/pdf')
  @Roles(Role.STUDENT)
  @Header('Content-Type', 'application/pdf')
  async getMyReportCardPdf(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const { buffer, fileName } = await this.studentMeService.getMyReportCardPdf(user.userId);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  }

  // ─── Parameterised routes ─────────────────────────────────────────────────────

  @Get(':id')
  @Roles(
    Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR,
    Role.TEACHER, Role.ACCOUNTANT, Role.LIBRARIAN,
  )
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.studentService.findOne(id);
  }

  @Post(':id/enroll')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  enroll(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EnrollStudentDto) {
    return this.studentService.enroll(id, dto);
  }

  @Patch(':id')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStudentDto) {
    return this.studentService.updateStudent(id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL)
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStudentStatusDto) {
    return this.studentService.updateStatus(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.studentService.removeStudent(id);
  }

  @Post(':id/account')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  createStudentAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateStudentAccountDto,
  ) {
    return this.studentService.createStudentAccount(id, dto);
  }

  @Post(':studentId/guardians')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  provisionGuardian(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: ProvisionGuardianDto,
  ) {
    return this.guardianService.provisionGuardian(studentId, dto);
  }

  // CL Phase 1 — severs this one guardian-student link (soft delete). Does not
  // touch the guardian's login; see GuardianService.removeGuardian.
  @Delete(':studentId/guardians/:guardianId')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  removeGuardian(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('guardianId', ParseUUIDPipe) guardianId: string,
  ) {
    return this.guardianService.removeGuardian(studentId, guardianId);
  }

  @Post(':studentId/guardians/:guardianId/account')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  createGuardianAccount(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('guardianId', ParseUUIDPipe) guardianId: string,
    @Body() dto: CreateGuardianAccountDto,
  ) {
    return this.guardianService.createGuardianAccount(studentId, guardianId, dto);
  }

  // MAIL-1 resend endpoints: regenerate a temp password + email it. Throttled —
  // each call invalidates the person's sessions, so abuse is a lockout vector.
  @Post(':id/account/resend')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  resendStudentCredentials(@Param('id', ParseUUIDPipe) id: string) {
    return this.studentService.resendStudentCredentials(id);
  }

  @Post(':studentId/guardians/:guardianId/account/resend')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  resendGuardianCredentials(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('guardianId', ParseUUIDPipe) guardianId: string,
  ) {
    return this.guardianService.resendGuardianCredentials(studentId, guardianId);
  }
}
