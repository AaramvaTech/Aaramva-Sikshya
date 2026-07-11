import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FeeCategoryService } from './fee-category.service';
import { FeeStructureService } from './fee-structure.service';
import { InvoiceService } from './invoice.service';
import { PaymentService } from './payment.service';
import { ReportService } from './report.service';
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
    EsewaService,
    KhaltiService,
  ],
  exports: [InvoiceService, PaymentService],
})
export class FinanceModule {}
