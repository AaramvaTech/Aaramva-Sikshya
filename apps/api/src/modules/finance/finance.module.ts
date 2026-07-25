import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { BillCatalogController } from './bill-catalog.controller';
import { BillAssignmentController } from './bill-assignment.controller';
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
import { StudentFeeStructureAssignmentService } from './student-fee-structure-assignment.service';
import { StudentFeeOverrideService } from './student-fee-override.service';
import { StudentConcessionService } from './student-concession.service';
import { StudentTransportAssignmentService } from './student-transport-assignment.service';
import { BulkAssignJobService } from './bulk-assign-job.service';
import { BulkAssignRunnerService } from './bulk-assign-runner.service';
import { BulkAssignPoller } from './bulk-assign.poller';
import { FeePreviewService } from './fee-preview.service';
import { ConcessionRegisterReportService } from './concession-register-report.service';
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
    BillAssignmentController,
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
    StudentFeeStructureAssignmentService,
    StudentFeeOverrideService,
    StudentConcessionService,
    StudentTransportAssignmentService,
    BulkAssignJobService,
    BulkAssignRunnerService,
    BulkAssignPoller,
    FeePreviewService,
    ConcessionRegisterReportService,
    EsewaService,
    KhaltiService,
  ],
  exports: [InvoiceService, PaymentService],
})
export class FinanceModule {}
