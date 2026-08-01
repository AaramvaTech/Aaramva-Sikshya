import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { FeeHeadService } from './fee-head.service';
import { DiscountReasonService } from './discount-reason.service';
import { CorrectionReasonService } from './correction-reason.service';
import { TransportRouteService } from './transport-route.service';
import { TaxRateService } from './tax-rate.service';
import { LateFeeRuleService } from './late-fee-rule.service';
import { BillFeeStructureService } from './bill-fee-structure.service';
import { CreateFeeHeadDto, UpdateFeeHeadDto, FeeHeadQueryDto } from './dto/fee-head.dto';
import {
  CreateDiscountReasonDto, UpdateDiscountReasonDto, DiscountReasonQueryDto,
} from './dto/discount-reason.dto';
import {
  CreateCorrectionReasonDto, UpdateCorrectionReasonDto, CorrectionReasonQueryDto,
} from './dto/correction-reason.dto';
import {
  CreateTransportRouteDto, UpdateTransportRouteDto, TransportRouteQueryDto,
} from './dto/transport-route.dto';
import { CreateTaxRateDto, UpdateTaxRateDto, TaxRateQueryDto } from './dto/tax-rate.dto';
import {
  CreateLateFeeRuleDto, UpdateLateFeeRuleDto, LateFeeRuleQueryDto,
} from './dto/late-fee-rule.dto';
import {
  CreateBillFeeStructureDto, UpdateBillFeeStructureItemsDto, BillFeeStructureQueryDto,
} from './dto/bill-fee-structure.dto';

const OWNER_ONLY = [Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER];
const ACCOUNTANT_AND_ABOVE = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT,
];

/**
 * BILL-1 (Phase 2) catalog CRUD. All ACCOUNTANT_AND_ABOVE, delete OWNER_ONLY.
 * A separate controller from FinanceController (which already carries 5
 * sub-resources) rather than growing that file further.
 *
 * BUGS-3: /finance/bill/fee-structures is a deliberately different path from
 * FinanceController's existing /finance/fee-structures — that one keeps
 * serving the old table, unmodified, until the Phase 4 cutover.
 */
@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillCatalogController {
  constructor(
    private readonly feeHeadService: FeeHeadService,
    private readonly discountReasonService: DiscountReasonService,
    private readonly correctionReasonService: CorrectionReasonService,
    private readonly transportRouteService: TransportRouteService,
    private readonly taxRateService: TaxRateService,
    private readonly lateFeeRuleService: LateFeeRuleService,
    private readonly billFeeStructureService: BillFeeStructureService,
  ) {}

  // ─── Fee Heads ─────────────────────────────────────────────────────────────

  @Post('fee-heads')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  createFeeHead(@Body() dto: CreateFeeHeadDto) {
    return this.feeHeadService.create(dto);
  }

  @Get('fee-heads')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  listFeeHeads(@Query() query: FeeHeadQueryDto) {
    return this.feeHeadService.findAll(query);
  }

  @Patch('fee-heads/:id')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  updateFeeHead(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFeeHeadDto) {
    return this.feeHeadService.update(id, dto);
  }

  @Delete('fee-heads/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...OWNER_ONLY)
  deleteFeeHead(@Param('id', ParseUUIDPipe) id: string) {
    return this.feeHeadService.softDelete(id);
  }

  // ─── Discount Reasons ──────────────────────────────────────────────────────

  @Post('discount-reasons')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  createDiscountReason(@Body() dto: CreateDiscountReasonDto) {
    return this.discountReasonService.create(dto);
  }

  @Get('discount-reasons')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  listDiscountReasons(@Query() query: DiscountReasonQueryDto) {
    return this.discountReasonService.findAll(query);
  }

  @Patch('discount-reasons/:id')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  updateDiscountReason(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDiscountReasonDto) {
    return this.discountReasonService.update(id, dto);
  }

  @Delete('discount-reasons/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...OWNER_ONLY)
  deleteDiscountReason(@Param('id', ParseUUIDPipe) id: string) {
    return this.discountReasonService.softDelete(id);
  }

  // ─── Correction Reasons (BILL-6) ───────────────────────────────────────────

  @Post('correction-reasons')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  createCorrectionReason(@Body() dto: CreateCorrectionReasonDto) {
    return this.correctionReasonService.create(dto);
  }

  @Get('correction-reasons')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  listCorrectionReasons(@Query() query: CorrectionReasonQueryDto) {
    return this.correctionReasonService.findAll(query);
  }

  @Patch('correction-reasons/:id')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  updateCorrectionReason(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCorrectionReasonDto) {
    return this.correctionReasonService.update(id, dto);
  }

  @Delete('correction-reasons/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...OWNER_ONLY)
  deleteCorrectionReason(@Param('id', ParseUUIDPipe) id: string) {
    return this.correctionReasonService.softDelete(id);
  }

  // ─── Transport Routes ──────────────────────────────────────────────────────

  @Post('transport-routes')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  createTransportRoute(@Body() dto: CreateTransportRouteDto) {
    return this.transportRouteService.create(dto);
  }

  @Get('transport-routes')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  listTransportRoutes(@Query() query: TransportRouteQueryDto) {
    return this.transportRouteService.findAll(query);
  }

  @Patch('transport-routes/:id')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  updateTransportRoute(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTransportRouteDto) {
    return this.transportRouteService.update(id, dto);
  }

  @Delete('transport-routes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...OWNER_ONLY)
  deleteTransportRoute(@Param('id', ParseUUIDPipe) id: string) {
    return this.transportRouteService.softDelete(id);
  }

  // ─── Tax Rates (ships empty — R6) ──────────────────────────────────────────

  @Post('tax-rates')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  createTaxRate(@Body() dto: CreateTaxRateDto, @CurrentUser('userId') userId: string) {
    return this.taxRateService.create(dto, userId);
  }

  @Get('tax-rates')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  listTaxRates(@Query() query: TaxRateQueryDto) {
    return this.taxRateService.findAll(query);
  }

  @Patch('tax-rates/:id')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  updateTaxRate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaxRateDto) {
    return this.taxRateService.update(id, dto);
  }

  @Delete('tax-rates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...OWNER_ONLY)
  deleteTaxRate(@Param('id', ParseUUIDPipe) id: string) {
    return this.taxRateService.softDelete(id);
  }

  // ─── Late Fee Rules (ships disabled per tenant — R14) ──────────────────────

  @Post('late-fee-rules')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  createLateFeeRule(@Body() dto: CreateLateFeeRuleDto) {
    return this.lateFeeRuleService.create(dto);
  }

  @Get('late-fee-rules')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  listLateFeeRules(@Query() query: LateFeeRuleQueryDto) {
    return this.lateFeeRuleService.findAll(query);
  }

  @Patch('late-fee-rules/:id')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  updateLateFeeRule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLateFeeRuleDto) {
    return this.lateFeeRuleService.update(id, dto);
  }

  @Delete('late-fee-rules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...OWNER_ONLY)
  deleteLateFeeRule(@Param('id', ParseUUIDPipe) id: string) {
    return this.lateFeeRuleService.softDelete(id);
  }

  // ─── Fee Structures (new catalog definition — BUGS-3: /finance/bill/... ) ──

  @Post('bill/fee-structures')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  createBillFeeStructure(
    @Body() dto: CreateBillFeeStructureDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.billFeeStructureService.createFeeStructure(dto, userId);
  }

  @Get('bill/fee-structures')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  listBillFeeStructures(@Query() query: BillFeeStructureQueryDto) {
    return this.billFeeStructureService.findAll(query);
  }

  @Get('bill/fee-structures/:id')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  getBillFeeStructure(@Param('id', ParseUUIDPipe) id: string) {
    return this.billFeeStructureService.findOne(id);
  }

  @Patch('bill/fee-structures/:id/items')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  updateBillFeeStructureItems(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBillFeeStructureItemsDto,
  ) {
    return this.billFeeStructureService.updateItems(id, dto);
  }

  @Delete('bill/fee-structures/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...OWNER_ONLY)
  deleteBillFeeStructure(@Param('id', ParseUUIDPipe) id: string) {
    return this.billFeeStructureService.softDelete(id);
  }
}
