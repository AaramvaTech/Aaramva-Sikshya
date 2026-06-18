import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { DepartmentService } from './department.service';
import { DesignationService } from './designation.service';
import { StaffService } from './staff.service';
import { LeaveService } from './leave.service';
import { PayrollService } from './payroll.service';
import { CreateDepartmentDto, UpdateDepartmentDto, DepartmentQueryDto } from './dto/department.dto';
import { CreateDesignationDto, UpdateDesignationDto, DesignationQueryDto } from './dto/designation.dto';
import { CreateStaffDto, UpdateStaffDto, StaffQueryDto, AddStaffDocumentDto } from './dto/staff.dto';
import { CreateLeaveTypeDto, UpdateLeaveTypeDto, ApplyLeaveDto, ReviewLeaveDto, LeaveQueryDto } from './dto/leave.dto';
import { OpenPayrollMonthDto, GeneratePayrollDto, AdjustSlipDto, PayrollMonthQueryDto } from './dto/payroll.dto';
import type { AuthUser } from '../auth/auth.types';

const OWNER_ONLY = [Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER];
const PRINCIPAL_AND_ABOVE = [Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL];
const ACCOUNTANT_AND_ABOVE = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT,
];
const TEACHER_AND_ABOVE = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT, Role.LIBRARIAN, Role.TEACHER,
];
const REVIEWER_ROLES = [Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR];

@Controller('hr')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HrController {
  constructor(
    private readonly departmentService: DepartmentService,
    private readonly designationService: DesignationService,
    private readonly staffService: StaffService,
    private readonly leaveService: LeaveService,
    private readonly payrollService: PayrollService,
  ) {}

  // ─── Departments ───────────────────────────────────────────────────────────

  @Post('departments')
  @Roles(Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL)
  createDepartment(@Body() dto: CreateDepartmentDto) {
    return this.departmentService.create(dto);
  }

  @Get('departments')
  @Roles(...TEACHER_AND_ABOVE)
  listDepartments(@Query() query: DepartmentQueryDto) {
    return this.departmentService.findAll(query);
  }

  @Patch('departments/:id')
  @Roles(...PRINCIPAL_AND_ABOVE)
  updateDepartment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.departmentService.update(id, dto);
  }

  @Delete('departments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...OWNER_ONLY)
  deleteDepartment(@Param('id', ParseUUIDPipe) id: string) {
    return this.departmentService.softDelete(id);
  }

  // ─── Designations ──────────────────────────────────────────────────────────

  @Post('designations')
  @Roles(...PRINCIPAL_AND_ABOVE)
  createDesignation(@Body() dto: CreateDesignationDto) {
    return this.designationService.create(dto);
  }

  @Get('designations')
  @Roles(...TEACHER_AND_ABOVE)
  listDesignations(@Query() query: DesignationQueryDto) {
    return this.designationService.findAll(query);
  }

  @Patch('designations/:id')
  @Roles(...PRINCIPAL_AND_ABOVE)
  updateDesignation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDesignationDto,
  ) {
    return this.designationService.update(id, dto);
  }

  @Delete('designations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...OWNER_ONLY)
  deleteDesignation(@Param('id', ParseUUIDPipe) id: string) {
    return this.designationService.softDelete(id);
  }

  // ─── Staff Profiles ────────────────────────────────────────────────────────

  @Post('staff')
  @Roles(...PRINCIPAL_AND_ABOVE)
  createStaff(@Body() dto: CreateStaffDto) {
    return this.staffService.createStaff(dto);
  }

  @Get('staff')
  @Roles(...PRINCIPAL_AND_ABOVE)
  listStaff(@Query() query: StaffQueryDto) {
    return this.staffService.listStaff(query);
  }

  @Get('staff/me')
  @Roles(...TEACHER_AND_ABOVE)
  getMyStaffProfile(@CurrentUser() user: AuthUser) {
    return this.staffService.getMyProfile(user.userId);
  }

  @Get('staff/:id')
  @Roles(...PRINCIPAL_AND_ABOVE)
  getStaff(@Param('id', ParseUUIDPipe) id: string) {
    return this.staffService.getStaffDetail(id);
  }

  @Patch('staff/:id')
  @Roles(...PRINCIPAL_AND_ABOVE)
  updateStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staffService.updateStaff(id, dto);
  }

  @Delete('staff/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...OWNER_ONLY)
  deleteStaff(@Param('id', ParseUUIDPipe) id: string) {
    return this.staffService.softDeleteStaff(id);
  }

  @Post('staff/:id/documents')
  @Roles(...PRINCIPAL_AND_ABOVE)
  addDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddStaffDocumentDto,
  ) {
    return this.staffService.addDocument(id, dto);
  }

  @Get('staff/:id/documents')
  @Roles(...PRINCIPAL_AND_ABOVE)
  listDocuments(@Param('id', ParseUUIDPipe) id: string) {
    return this.staffService.listDocuments(id);
  }

  // ─── Leave Types ───────────────────────────────────────────────────────────

  @Post('leave-types')
  @Roles(Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL)
  createLeaveType(@Body() dto: CreateLeaveTypeDto) {
    return this.leaveService.createLeaveType(dto);
  }

  @Get('leave-types')
  @Roles(...TEACHER_AND_ABOVE)
  listLeaveTypes() {
    return this.leaveService.listLeaveTypes();
  }

  @Patch('leave-types/:id')
  @Roles(...PRINCIPAL_AND_ABOVE)
  updateLeaveType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeaveTypeDto,
  ) {
    return this.leaveService.updateLeaveType(id, dto);
  }

  @Delete('leave-types/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...PRINCIPAL_AND_ABOVE)
  deleteLeaveType(@Param('id', ParseUUIDPipe) id: string) {
    return this.leaveService.deleteLeaveType(id);
  }

  // ─── Leave Requests ────────────────────────────────────────────────────────

  @Post('leave')
  @Roles(...TEACHER_AND_ABOVE)
  applyLeave(
    @Body() dto: ApplyLeaveDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.leaveService.applyLeave(dto, user.userId);
  }

  @Get('leave')
  @Roles(...PRINCIPAL_AND_ABOVE)
  listLeaveRequests(@Query() query: LeaveQueryDto) {
    return this.leaveService.listLeaveRequests(query);
  }

  @Get('leave/my')
  @Roles(...TEACHER_AND_ABOVE)
  myLeaveRequests(
    @Query() query: LeaveQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.leaveService.getMyLeaveRequests(user.userId, query);
  }

  @Patch('leave/:id/review')
  @Roles(...REVIEWER_ROLES)
  reviewLeave(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewLeaveDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.leaveService.reviewLeave(id, dto, user.userId);
  }

  @Patch('leave/:id/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...TEACHER_AND_ABOVE)
  cancelLeave(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.leaveService.cancelLeave(id, user.userId);
  }

  @Get('leave/balance/:userId')
  @Roles(...TEACHER_AND_ABOVE)
  getLeaveBalance(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.leaveService.getLeaveBalance(userId);
  }

  // ─── Payroll ───────────────────────────────────────────────────────────────

  @Post('payroll/months')
  @Roles(Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.ACCOUNTANT)
  openPayrollMonth(
    @Body() dto: OpenPayrollMonthDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payrollService.openPayrollMonth(dto, user.userId);
  }

  @Get('payroll/months')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  listPayrollMonths(@Query() query: PayrollMonthQueryDto) {
    return this.payrollService.listPayrollMonths(query);
  }

  @Post('payroll/months/:id/generate')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  generatePayroll(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GeneratePayrollDto,
  ) {
    return this.payrollService.generatePayroll(id, dto);
  }

  @Get('payroll/months/:id/slips')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  listSlips(@Param('id', ParseUUIDPipe) id: string) {
    return this.payrollService.listSlips(id);
  }

  @Patch('payroll/months/:id/slips/:slipId')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  adjustSlip(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('slipId', ParseUUIDPipe) slipId: string,
    @Body() dto: AdjustSlipDto,
  ) {
    return this.payrollService.adjustSlip(id, slipId, dto);
  }

  @Delete('payroll/months/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.ACCOUNTANT)
  deletePayrollMonth(@Param('id', ParseUUIDPipe) id: string) {
    return this.payrollService.deletePayrollMonth(id);
  }

  @Patch('payroll/months/:id/finalize')
  @Roles(...OWNER_ONLY)
  finalizePayroll(@Param('id', ParseUUIDPipe) id: string) {
    return this.payrollService.finalizePayroll(id);
  }

  @Get('payroll/slips/:slipId')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  getSlip(@Param('slipId', ParseUUIDPipe) slipId: string) {
    return this.payrollService.getSlip(slipId);
  }

  @Get('payroll/staff/:userId/history')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  getStaffSalaryHistory(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.payrollService.getStaffSalaryHistory(userId);
  }
}
