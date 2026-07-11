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

@Module({
  controllers: [FinanceController, EsewaController, EsewaPublicController],
  providers: [
    FeeCategoryService,
    FeeStructureService,
    InvoiceService,
    PaymentService,
    ReportService,
    EsewaService,
  ],
  exports: [InvoiceService, PaymentService],
})
export class FinanceModule {}
