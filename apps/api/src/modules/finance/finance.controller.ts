import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { FeeCategoryService } from './fee-category.service';
import { FeeStructureService } from './fee-structure.service';
import { InvoiceService } from './invoice.service';
import { PaymentService } from './payment.service';
import { ReportService } from './report.service';
import { CreateFeeCategoryDto, UpdateFeeCategoryDto, FeeCategoryQueryDto } from './dto/fee-category.dto';
import {
  CreateFeeStructureDto,
  UpdateFeeStructureItemsDto,
  FeeStructureQueryDto,
} from './dto/fee-structure.dto';
import {
  GenerateInvoiceDto,
  GenerateBulkInvoiceDto,
  SetStudentFeeAssignmentDto,
  InvoiceQueryDto,
} from './dto/invoice.dto';
import { RecordPaymentDto, PaymentQueryDto } from './dto/payment.dto';

const OWNER_ONLY = [Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER];
const ACCOUNTANT_AND_ABOVE = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT,
];
const PRINCIPAL_AND_ABOVE = [Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL];

@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceController {
  constructor(
    private readonly feeCategoryService: FeeCategoryService,
    private readonly feeStructureService: FeeStructureService,
    private readonly invoiceService: InvoiceService,
    private readonly paymentService: PaymentService,
    private readonly reportService: ReportService,
  ) {}

  // ─── Fee Categories ────────────────────────────────────────────────────────

  @Post('fee-categories')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  createFeeCategory(@Body() dto: CreateFeeCategoryDto) {
    return this.feeCategoryService.create(dto);
  }

  @Get('fee-categories')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  listFeeCategories(@Query() query: FeeCategoryQueryDto) {
    return this.feeCategoryService.findAll(query);
  }

  @Patch('fee-categories/:id')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  updateFeeCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFeeCategoryDto,
  ) {
    return this.feeCategoryService.update(id, dto);
  }

  @Delete('fee-categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...OWNER_ONLY)
  deleteFeeCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.feeCategoryService.softDelete(id);
  }

  // ─── Fee Structures ────────────────────────────────────────────────────────

  @Post('fee-structures')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  createFeeStructure(@Body() dto: CreateFeeStructureDto, @CurrentUser('id') userId: string) {
    return this.feeStructureService.createFeeStructure(dto, userId);
  }

  @Get('fee-structures')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  listFeeStructures(@Query() query: FeeStructureQueryDto) {
    return this.feeStructureService.findAll(query);
  }

  @Get('fee-structures/:id')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  getFeeStructure(@Param('id', ParseUUIDPipe) id: string) {
    return this.feeStructureService.findOne(id);
  }

  @Patch('fee-structures/:id/items')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  updateFeeStructureItems(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFeeStructureItemsDto,
  ) {
    return this.feeStructureService.updateItems(id, dto);
  }

  @Delete('fee-structures/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...OWNER_ONLY)
  deleteFeeStructure(@Param('id', ParseUUIDPipe) id: string) {
    return this.feeStructureService.softDelete(id);
  }

  // ─── Student Fee Assignments ───────────────────────────────────────────────

  @Post('students/:studentId/assignments')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...ACCOUNTANT_AND_ABOVE)
  setStudentFeeAssignment(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: SetStudentFeeAssignmentDto,
  ) {
    return this.invoiceService.setStudentFeeAssignment(studentId, dto);
  }

  @Get('students/:studentId/assignments')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  getStudentFeeAssignments(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.invoiceService.getStudentFeeAssignments(studentId, academicYearId);
  }

  // ─── Invoices ──────────────────────────────────────────────────────────────

  @Post('invoices/generate')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  generateInvoice(@Body() dto: GenerateInvoiceDto, @CurrentUser('id') userId: string) {
    return this.invoiceService.generateInvoice(dto, userId);
  }

  @Post('invoices/generate-bulk')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  generateBulkInvoice(@Body() dto: GenerateBulkInvoiceDto, @CurrentUser('id') userId: string) {
    return this.invoiceService.generateBulkInvoice(dto, userId);
  }

  @Get('invoices')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  listInvoices(@Query() query: InvoiceQueryDto) {
    return this.invoiceService.findAll(query);
  }

  @Get('invoices/:id')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  getInvoice(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoiceService.findOne(id);
  }

  @Patch('invoices/:id/recalculate-fine')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...ACCOUNTANT_AND_ABOVE)
  recalculateFine(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoiceService.recalculateFine(id);
  }

  @Delete('invoices/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...OWNER_ONLY)
  voidInvoice(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoiceService.softDelete(id);
  }

  // ─── Payments ─────────────────────────────────────────────────────────────

  @Post('payments')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  recordPayment(@Body() dto: RecordPaymentDto, @CurrentUser('id') userId: string) {
    return this.paymentService.recordPayment(dto, userId);
  }

  @Get('payments')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  listPayments(@Query() query: PaymentQueryDto) {
    return this.paymentService.findAll(query);
  }

  @Get('payments/:id')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  getPayment(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentService.findOne(id);
  }

  @Delete('payments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...OWNER_ONLY)
  cancelPayment(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentService.cancelPayment(id);
  }

  // ─── Reports ───────────────────────────────────────────────────────────────

  @Get('reports/collection')
  @Roles(...PRINCIPAL_AND_ABOVE)
  getCollectionReport(@Query('academicYearId') academicYearId: string) {
    return this.reportService.getCollectionReport(academicYearId);
  }

  @Get('reports/defaulters')
  @Roles(...PRINCIPAL_AND_ABOVE)
  getDefaulters(@Query('academicYearId') academicYearId: string) {
    return this.reportService.getDefaulters(academicYearId);
  }

  @Get('reports/student/:studentId')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  getStudentLedger(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('academicYearId') academicYearId: string,
  ) {
    return this.reportService.getStudentLedger(studentId, academicYearId);
  }
}
