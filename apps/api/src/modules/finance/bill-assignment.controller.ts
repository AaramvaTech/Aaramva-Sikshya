import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { StudentFeeStructureAssignmentService } from './student-fee-structure-assignment.service';
import { BulkAssignJobService } from './bulk-assign-job.service';
import { BillPrintJobService } from './bill-print-job.service';
import { StudentFeeOverrideService } from './student-fee-override.service';
import { StudentConcessionService } from './student-concession.service';
import { StudentTransportAssignmentService } from './student-transport-assignment.service';
import { FeePreviewService } from './fee-preview.service';
import { ConcessionRegisterReportService } from './concession-register-report.service';
import {
  AssignFeeStructureDto, BulkAssignDto, StudentFeeStructureAssignmentQueryDto,
} from './dto/student-fee-structure-assignment.dto';
import {
  CreateStudentFeeOverrideDto, UpdateStudentFeeOverrideDto, StudentFeeOverrideQueryDto,
} from './dto/student-fee-override.dto';
import {
  CreateStudentConcessionDto, UpdateStudentConcessionDto, StudentConcessionQueryDto,
} from './dto/student-concession.dto';
import {
  CreateStudentTransportAssignmentDto, UpdateStudentTransportAssignmentDto,
  StudentTransportAssignmentQueryDto,
} from './dto/student-transport-assignment.dto';
import { FeePreviewQueryDto } from './dto/fee-preview.dto';
import { ConcessionRegisterQueryDto } from './dto/concession-register.dto';
import type { AuthUser } from '../auth/auth.types';

const OWNER_ONLY = [Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER];
const ACCOUNTANT_AND_ABOVE = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT,
];

/**
 * BILL-2 (Phase 3) assignment and concessions. Separate controller from
 * BillCatalogController (Phase 2's catalog CRUD) — a distinct concern, same
 * modular-controller convention.
 *
 * BUGS-4: spec §6 writes the bulk-assign route as bare
 * `/finance/fee-structures/:id/bulk-assign`, but that `:id` must resolve
 * against `bill_fee_structures` (the NEW catalog table this phase's
 * assignment tables FK to), not the OLD `fee_structures` FinanceController
 * already serves at that exact path prefix. Mounting it there would make
 * `:id` ambiguous between two different tables at the same URL shape — the
 * same collision BUGS-3 already resolved for the catalog endpoints
 * themselves. Applying that same, already-approved `/finance/bill/...`
 * convention here rather than the literal spec path; flagged at Checkpoint 3
 * rather than block on it, since the correct answer follows directly from a
 * ruling already made.
 */
@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillAssignmentController {
  constructor(
    private readonly assignmentService: StudentFeeStructureAssignmentService,
    private readonly bulkAssignJobService: BulkAssignJobService,
    private readonly billPrintJobService: BillPrintJobService,
    private readonly overrideService: StudentFeeOverrideService,
    private readonly concessionService: StudentConcessionService,
    private readonly transportAssignmentService: StudentTransportAssignmentService,
    private readonly feePreviewService: FeePreviewService,
    private readonly concessionRegisterReportService: ConcessionRegisterReportService,
  ) {}

  // ─── Fee structure assignment ──────────────────────────────────────────────

  @Post('students/:studentId/fee-structure')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  assignFeeStructure(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: AssignFeeStructureDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.assignmentService.assign(studentId, dto, userId);
  }

  /** UI-2 §2 — the read endpoint this resource was missing (overrides/
   *  concessions/transport-assignments all already had one). Not paginated,
   *  see StudentFeeStructureAssignmentQueryDto's own comment. */
  @Get('students/:studentId/fee-structure')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  listFeeStructureAssignments(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: StudentFeeStructureAssignmentQueryDto,
  ) {
    return this.assignmentService.findAllForStudent(studentId, query.academicYearId);
  }

  @Post('bill/fee-structures/:id/bulk-assign')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  bulkAssign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BulkAssignDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.bulkAssignJobService.create(id, dto, userId);
  }

  /** BILL-8 Checkpoint C reuses this endpoint (spec §5) for bill-print job
   *  status rather than adding a second one — bulk-assign and bill-print
   *  jobs are separate tables/services, so a miss on one is tried against
   *  the other before giving up with a real 404. */
  @Get('jobs/:id')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  async getJob(@Param('id', ParseUUIDPipe) id: string) {
    try {
      return await this.bulkAssignJobService.findOne(id);
    } catch (err) {
      if (!(err instanceof NotFoundException)) throw err;
      return this.billPrintJobService.findOne(id);
    }
  }

  // ─── Fee overrides ──────────────────────────────────────────────────────────

  @Post('fee-overrides')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  createFeeOverride(@Body() dto: CreateStudentFeeOverrideDto, @CurrentUser('userId') userId: string) {
    return this.overrideService.create(dto, userId);
  }

  @Get('fee-overrides')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  listFeeOverrides(@Query() query: StudentFeeOverrideQueryDto) {
    return this.overrideService.findAll(query);
  }

  @Patch('fee-overrides/:id')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  updateFeeOverride(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStudentFeeOverrideDto) {
    return this.overrideService.update(id, dto);
  }

  @Delete('fee-overrides/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...OWNER_ONLY)
  deleteFeeOverride(@Param('id', ParseUUIDPipe) id: string) {
    return this.overrideService.softDelete(id);
  }

  // ─── Concessions ────────────────────────────────────────────────────────────

  @Post('concessions')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  createConcession(@Body() dto: CreateStudentConcessionDto, @CurrentUser('userId') userId: string) {
    return this.concessionService.create(dto, userId);
  }

  @Get('concessions')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  listConcessions(@Query() query: StudentConcessionQueryDto) {
    return this.concessionService.findAll(query);
  }

  @Patch('concessions/:id')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  updateConcession(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStudentConcessionDto) {
    return this.concessionService.update(id, dto);
  }

  @Delete('concessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...OWNER_ONLY)
  deleteConcession(@Param('id', ParseUUIDPipe) id: string) {
    return this.concessionService.softDelete(id);
  }

  // ─── Transport assignments ──────────────────────────────────────────────────

  @Post('transport-assignments')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  createTransportAssignment(
    @Body() dto: CreateStudentTransportAssignmentDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.transportAssignmentService.create(dto, userId);
  }

  @Get('transport-assignments')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  listTransportAssignments(@Query() query: StudentTransportAssignmentQueryDto) {
    return this.transportAssignmentService.findAll(query);
  }

  @Patch('transport-assignments/:id')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  updateTransportAssignment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentTransportAssignmentDto,
  ) {
    return this.transportAssignmentService.update(id, dto);
  }

  @Delete('transport-assignments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...OWNER_ONLY)
  deleteTransportAssignment(@Param('id', ParseUUIDPipe) id: string) {
    return this.transportAssignmentService.softDelete(id);
  }

  // ─── Reports & preview ──────────────────────────────────────────────────────

  @Get('reports/concession-register')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  concessionRegister(@Query() query: ConcessionRegisterQueryDto) {
    return this.concessionRegisterReportService.findAll(query);
  }

  @Get('students/:studentId/fee-preview')
  @Roles(...ACCOUNTANT_AND_ABOVE, Role.PARENT)
  feePreview(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: FeePreviewQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.feePreviewService.preview(studentId, query, user.userId, user.role);
  }
}
