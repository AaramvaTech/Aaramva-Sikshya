import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FeeCategoryService } from './fee-category.service';
import { FeeStructureService } from './fee-structure.service';
import { InvoiceService } from './invoice.service';
import { PaymentService } from './payment.service';
import { ReportService } from './report.service';

@Module({
  controllers: [FinanceController],
  providers: [
    FeeCategoryService,
    FeeStructureService,
    InvoiceService,
    PaymentService,
    ReportService,
  ],
  exports: [InvoiceService, PaymentService],
})
export class FinanceModule {}
