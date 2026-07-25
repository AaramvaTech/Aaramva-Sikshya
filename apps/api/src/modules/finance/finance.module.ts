import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { BillCatalogController } from './bill-catalog.controller';
import { FeeCategoryService } from './fee-category.service';
import { FeeStructureService } from './fee-structure.service';
import { InvoiceService } from './invoice.service';
import { PaymentService } from './payment.service';
import { ReportService } from './report.service';
import { FeeHeadService } from './fee-head.service';
import { DiscountReasonService } from './discount-reason.service';
import { TransportRouteService } from './transport-route.service';
import { TaxRateService } from './tax-rate.service';
import { LateFeeRuleService } from './late-fee-rule.service';
import { BillFeeStructureService } from './bill-fee-structure.service';
import { EsewaService } from './esewa/esewa.service';
import { EsewaController } from './esewa/esewa.controller';
import { EsewaPublicController } from './esewa/esewa-public.controller';
import { KhaltiService } from './khalti/khalti.service';
import { KhaltiController } from './khalti/khalti.controller';
import { KhaltiPublicController } from './khalti/khalti-public.controller';
import { PaymentGatewaysController } from './payment-gateways.controller';

@Module({
  controllers: [
    FinanceController,
    BillCatalogController,
    EsewaController,
    EsewaPublicController,
    KhaltiController,
    KhaltiPublicController,
    PaymentGatewaysController,
  ],
  providers: [
    FeeCategoryService,
    FeeStructureService,
    InvoiceService,
    PaymentService,
    ReportService,
    FeeHeadService,
    DiscountReasonService,
    TransportRouteService,
    TaxRateService,
    LateFeeRuleService,
    BillFeeStructureService,
    EsewaService,
    KhaltiService,
  ],
  exports: [InvoiceService, PaymentService],
})
export class FinanceModule {}
