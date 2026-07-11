import {
  Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, ParseUUIDPipe,
  Patch, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../auth/auth.types';
import { GradingScaleService } from './grading-scale.service';
import { ExamTypeService } from './exam-type.service';
import { ExamScheduleService } from './exam-schedule.service';
import { MarksService } from './marks.service';
import { ResultService } from './result.service';
import {
  CreateGradingScaleDto, UpdateGradingScaleDto,
  CreateExamTypeDto, UpdateExamTypeDto, ExamTypeQueryDto, PublishExamTypeDto,
  CreateExamScheduleDto, BulkCreateScheduleDto, UpdateExamScheduleDto, ExamScheduleQueryDto,
  MyExamScheduleQueryDto,
  BulkEnterMarksDto, UpdateMarkDto, MarksQueryDto,
  ComputeResultsDto,
} from './dto/examination.dto';

const PRINCIPAL_AND_ABOVE = [Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL];
const COORDINATOR_AND_ABOVE = [Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR];
const TEACHER_AND_ABOVE = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT, Role.LIBRARIAN, Role.TEACHER,
];

@Controller('exams')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExaminationController {
  constructor(
    private readonly gradingScaleService: GradingScaleService,
    private readonly examTypeService: ExamTypeService,
    private readonly examScheduleService: ExamScheduleService,
    private readonly marksService: MarksService,
    private readonly resultService: ResultService,
  ) {}

  // ─── Grading Scales ────────────────────────────────────────────────────────

  @Post('grading-scales')
  @Roles(...PRINCIPAL_AND_ABOVE)
  createGradingScale(@Body() dto: CreateGradingScaleDto) {
    return this.gradingScaleService.createScale(dto);
  }

  @Get('grading-scales')
  @Roles(...TEACHER_AND_ABOVE)
  listGradingScales() {
    return this.gradingScaleService.findAll();
  }

  @Get('grading-scales/:id')
  @Roles(...TEACHER_AND_ABOVE)
  getGradingScale(@Param('id', ParseUUIDPipe) id: string) {
    return this.gradingScaleService.findOne(id);
  }

  // POL-1 T6: rename only — thresholds are immutable (see GradingScaleService.rename)
  @Patch('grading-scales/:id')
  @Roles(...PRINCIPAL_AND_ABOVE)
  renameGradingScale(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGradingScaleDto,
  ) {
    return this.gradingScaleService.rename(id, dto);
  }

  @Patch('grading-scales/:id/set-default')
  @Roles(...PRINCIPAL_AND_ABOVE)
  setDefaultGradingScale(@Param('id', ParseUUIDPipe) id: string) {
    return this.gradingScaleService.setDefault(id);
  }

  // ─── Exam Types ────────────────────────────────────────────────────────────

  @Post('types')
  @Roles(Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  createExamType(@Body() dto: CreateExamTypeDto) {
    return this.examTypeService.create(dto);
  }

  @Get('types')
  @Roles(...TEACHER_AND_ABOVE)
  listExamTypes(@Query() query: ExamTypeQueryDto) {
    return this.examTypeService.findAll(query);
  }

  @Patch('types/:id')
  @Roles(...COORDINATOR_AND_ABOVE)
  updateExamType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExamTypeDto,
  ) {
    return this.examTypeService.update(id, dto);
  }

  @Patch('types/:id/publish')
  @Roles(...COORDINATOR_AND_ABOVE)
  publishExamType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishExamTypeDto,
  ) {
    return this.examTypeService.setPublished(id, dto.published);
  }

  @Delete('types/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...PRINCIPAL_AND_ABOVE)
  deleteExamType(@Param('id', ParseUUIDPipe) id: string) {
    return this.examTypeService.softDelete(id);
  }

  // ─── Exam Schedules ────────────────────────────────────────────────────────

  @Post('schedules')
  @Roles(...COORDINATOR_AND_ABOVE)
  createSchedule(@Body() dto: CreateExamScheduleDto) {
    return this.examScheduleService.create(dto);
  }

  @Post('schedules/bulk')
  @Roles(...COORDINATOR_AND_ABOVE)
  bulkCreateSchedules(@Body() dto: BulkCreateScheduleDto) {
    return this.examScheduleService.bulkCreate(dto);
  }

  @Get('schedules/my')
  @Roles(...TEACHER_AND_ABOVE)
  getMySchedules(
    @Query() query: MyExamScheduleQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.examScheduleService.getMySchedules(user.userId, query.examTypeId);
  }

  @Get('schedules')
  @Roles(...TEACHER_AND_ABOVE)
  listSchedules(@Query() query: ExamScheduleQueryDto) {
    return this.examScheduleService.findAll(query);
  }

  @Patch('schedules/:id')
  @Roles(...COORDINATOR_AND_ABOVE)
  updateSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExamScheduleDto,
  ) {
    return this.examScheduleService.update(id, dto);
  }

  @Delete('schedules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...PRINCIPAL_AND_ABOVE)
  deleteSchedule(@Param('id', ParseUUIDPipe) id: string) {
    return this.examScheduleService.softDelete(id);
  }

  // ─── Marks ─────────────────────────────────────────────────────────────────

  @Post('marks/bulk')
  @Roles(...TEACHER_AND_ABOVE)
  bulkEnterMarks(
    @Body() dto: BulkEnterMarksDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.marksService.bulkEnterMarks(dto, user.userId);
  }

  @Get('marks')
  @Roles(...TEACHER_AND_ABOVE)
  getMarks(@Query() query: MarksQueryDto) {
    return this.marksService.getMarksForSchedule(query);
  }

  @Patch('marks/:id')
  @Roles(...TEACHER_AND_ABOVE)
  updateMark(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMarkDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.marksService.updateMark(id, dto, user.userId);
  }

  // ─── Results ───────────────────────────────────────────────────────────────

  @Post('results/compute')
  @Roles(...COORDINATOR_AND_ABOVE)
  computeResults(@Body() dto: ComputeResultsDto) {
    return this.resultService.computeResults(dto);
  }

  @Get('results/class/:classId')
  @Roles(...TEACHER_AND_ABOVE)
  getClassRankList(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query('examTypeId', ParseUUIDPipe) examTypeId: string,
  ) {
    return this.resultService.getClassRankList(classId, examTypeId);
  }

  @Get('results/student/:studentId')
  @Roles(Role.PARENT, ...TEACHER_AND_ABOVE)
  getStudentResults(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.resultService.getStudentResults(studentId, user.userId, user.role);
  }

  @Get('results/report-card/:studentId')
  @Roles(Role.PARENT, ...TEACHER_AND_ABOVE)
  getReportCard(
    @Param('studentId') studentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.resultService.getReportCard(studentId, user.userId, user.role);
  }

  @Get('results/report-card/:studentId/pdf')
  @Roles(Role.PARENT, ...TEACHER_AND_ABOVE)
  @Header('Content-Type', 'application/pdf')
  async getReportCardPdf(
    @Param('studentId') studentId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    // Hard-scope + publish gate enforced inside getReportCard (via buildReportCardPdf);
    // PARENT is limited to own child, 409 when nothing is published.
    const { buffer, fileName } = await this.resultService.buildReportCardPdf(
      studentId,
      user.userId,
      user.role,
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  }
}
