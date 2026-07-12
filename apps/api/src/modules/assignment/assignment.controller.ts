import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { AssignmentService } from './assignment.service';
import { ASSIGNMENT_MANAGER_ROLES, SubmissionService } from './submission.service';
import {
  AssignmentQueryDto,
  CreateAssignmentDto,
  ReviewSubmissionDto,
  SubmissionPresignDto,
  SubmitAssignmentDto,
  UpdateAssignmentDto,
} from './dto/assignment.dto';

/**
 * EDU-1 routes. Static segments (`me`, `my-children`) are declared BEFORE the
 * `:id` routes — Nest matches in declaration order (the payment-gateways
 * route-shadow lesson).
 */
@Controller('assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssignmentController {
  constructor(
    private readonly assignmentService: AssignmentService,
    private readonly submissionService: SubmissionService,
  ) {}

  // ─── Hard-scoped self routes (BEFORE :id) ───────────────────────────────────

  @Get('me')
  @Roles(Role.STUDENT)
  listMine(@Query() query: AssignmentQueryDto, @CurrentUser() user: AuthUser) {
    return this.submissionService.listMine(user, query);
  }

  @Get('my-children')
  @Roles(Role.PARENT)
  listForMyChildren(@CurrentUser() user: AuthUser) {
    return this.submissionService.listForMyChildren(user);
  }

  // ─── Teacher/admin CRUD (soft-scoped, created_by stamped) ───────────────────

  @Post()
  @Roles(...ASSIGNMENT_MANAGER_ROLES)
  create(@Body() dto: CreateAssignmentDto, @CurrentUser() user: AuthUser) {
    return this.assignmentService.create(dto, user);
  }

  @Get()
  @Roles(...ASSIGNMENT_MANAGER_ROLES)
  findAll(@Query() query: AssignmentQueryDto) {
    return this.assignmentService.findAll(query);
  }

  @Get(':id')
  @Roles(...ASSIGNMENT_MANAGER_ROLES)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.assignmentService.findOne(id);
  }

  @Patch(':id')
  @Roles(...ASSIGNMENT_MANAGER_ROLES)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAssignmentDto) {
    return this.assignmentService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...ASSIGNMENT_MANAGER_ROLES)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.assignmentService.softDelete(id);
  }

  @Post(':id/publish')
  @Roles(...ASSIGNMENT_MANAGER_ROLES)
  publish(@Param('id', ParseUUIDPipe) id: string) {
    return this.assignmentService.publish(id);
  }

  @Post(':id/close')
  @Roles(...ASSIGNMENT_MANAGER_ROLES)
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.assignmentService.close(id);
  }

  // ─── Submissions ────────────────────────────────────────────────────────────

  /** The scopedOnly presign gate for submission-file (FILE-1 kind policy). */
  @Post(':id/submissions/presign-upload')
  @Roles(Role.STUDENT)
  presignSubmission(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmissionPresignDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.submissionService.presignSubmissionUpload(id, dto, user);
  }

  @Post(':id/submissions')
  @Roles(Role.STUDENT)
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitAssignmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.submissionService.submit(id, dto, user);
  }

  @Get(':id/submissions/me')
  @Roles(Role.STUDENT)
  getMySubmission(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.submissionService.getMine(id, user);
  }

  @Get(':id/submissions')
  @Roles(...ASSIGNMENT_MANAGER_ROLES)
  listSubmissions(@Param('id', ParseUUIDPipe) id: string) {
    return this.submissionService.listForAssignment(id);
  }

  @Patch(':id/submissions/:submissionId/review')
  @Roles(...ASSIGNMENT_MANAGER_ROLES)
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body() dto: ReviewSubmissionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.submissionService.review(id, submissionId, dto, user);
  }
}
