import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { SuperAdminModule } from '../super-admin/super-admin.module';
import { FinanceController } from './finance.controller';
import { BillCatalogController } from './bill-catalog.controller';
import { BillAssignmentController } from './bill-assignment.controller';
import { BillRunController } from './bill-run.controller';
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
import { BillRunService } from './bill-run.service';
import { BillLineResolverService } from './bill-line-resolver.service';
import { BillRunPostRunnerService } from './bill-run-post-runner.service';
import { BillRunPostPoller } from './bill-run-post.poller';
import { FinanceSettingsService } from './finance-settings.service';
import { FinanceSettingsController } from './finance-settings.controller';
import { BillInvoiceService } from './bill-invoice.service';
import { BillInvoiceController } from './bill-invoice.controller';
import { BillPaymentService } from './bill-payment.service';
import { BillPaymentController } from './bill-payment.controller';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { OpeningBalanceImportService } from './opening-balance-import.service';
import { EsewaService } from './esewa/esewa.service';
import { EsewaController } from './esewa/esewa.controller';
import { EsewaPublicController } from './esewa/esewa-public.controller';
import { KhaltiService } from './khalti/khalti.service';
import { KhaltiController } from './khalti/khalti.controller';
import { KhaltiPublicController } from './khalti/khalti-public.controller';
import { PaymentGatewaysController } from './payment-gateways.controller';
import { BillPdfService } from './bill-pdf.service';
import { BillDocumentService } from './bill-document.service';
import { BillPdfController } from './bill-pdf.controller';
import { BillReceiptService } from './bill-receipt.service';
import { BillReceiptDocumentService } from './bill-receipt-document.service';
import { BillReceiptController } from './bill-receipt.controller';

@Module({
  imports: [StorageModule, SuperAdminModule],
  controllers: [
    FinanceController,
    BillCatalogController,
    BillAssignmentController,
    BillRunController,
    FinanceSettingsController,
    BillInvoiceController,
    BillPaymentController,
    LedgerController,
    EsewaController,
    EsewaPublicController,
    KhaltiController,
    KhaltiPublicController,
    PaymentGatewaysController,
    BillPdfController,
    BillReceiptController,
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
    BillRunService,
    BillLineResolverService,
    BillRunPostRunnerService,
    BillRunPostPoller,
    FinanceSettingsService,
    BillInvoiceService,
    BillPaymentService,
    LedgerService,
    OpeningBalanceImportService,
    EsewaService,
    KhaltiService,
    BillPdfService,
    BillDocumentService,
    BillReceiptService,
    BillReceiptDocumentService,
  ],
  exports: [InvoiceService, PaymentService, LedgerService],
})
export class FinanceModule {}
