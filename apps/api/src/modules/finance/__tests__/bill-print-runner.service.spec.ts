import { Test } from '@nestjs/testing';
import { BillPrintRunnerService } from '../bill-print-runner.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { StorageService } from '../../storage/storage.service';
import { BillInvoiceService } from '../bill-invoice.service';
import { BillDocumentService } from '../bill-document.service';
import { BillPdfService } from '../bill-pdf.service';
import { BillPrintJobRow } from '../entities/bill-print-job.entity';

function makeJob(overrides: Partial<BillPrintJobRow> = {}): BillPrintJobRow {
  return {
    id: 'job-1',
    job_type: 'RUN',
    ref_run_id: 'run-1',
    ref_class_id: null,
    ref_section_id: null,
    ref_bs_year: null,
    ref_bs_month: null,
    invoice_ids: ['inv-1', 'inv-2'],
    language: 'EN',
    status: 'PENDING',
    total: 2,
    processed: 0,
    failed_count: 0,
    failures: [],
    result_key: null,
    created_by: 'user-1',
    created_at: new Date('2026-07-30'),
    started_at: null,
    completed_at: null,
    ...overrides,
  };
}

describe('BillPrintRunnerService', () => {
  let service: BillPrintRunnerService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let billInvoiceService: jest.Mocked<BillInvoiceService>;
  let billDocumentService: jest.Mocked<BillDocumentService>;
  let billPdfService: jest.Mocked<BillPdfService>;
  let storageService: jest.Mocked<StorageService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BillPrintRunnerService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
        { provide: TenantContextService, useValue: { getOrThrow: jest.fn().mockReturnValue({ slug: 'demo' }) } },
        { provide: StorageService, useValue: { putObject: jest.fn() } },
        { provide: BillInvoiceService, useValue: { findOne: jest.fn() } },
        { provide: BillDocumentService, useValue: { loadTenantHeader: jest.fn(), buildPdfData: jest.fn() } },
        { provide: BillPdfService, useValue: { renderMerged: jest.fn() } },
      ],
    }).compile();

    service = module.get(BillPrintRunnerService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    billInvoiceService = module.get(BillInvoiceService) as jest.Mocked<BillInvoiceService>;
    billDocumentService = module.get(BillDocumentService) as jest.Mocked<BillDocumentService>;
    billPdfService = module.get(BillPdfService) as jest.Mocked<BillPdfService>;
    storageService = module.get(StorageService) as jest.Mocked<StorageService>;
    jest.clearAllMocks();
    (billDocumentService.loadTenantHeader as jest.Mock).mockResolvedValue({ name: 'Demo School' });
  });

  it('drainCurrentTenant() is a no-op when there are no pending/running jobs', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
    const result = await service.drainCurrentTenant();
    expect(result).toEqual({ jobsDrained: 0, invoicesProcessed: 0 });
    expect(billDocumentService.loadTenantHeader).not.toHaveBeenCalled();
  });

  it('renders every invoice in the job into one merged PDF and marks it COMPLETED', async () => {
    const job = makeJob();
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([job]);
    (billInvoiceService.findOne as jest.Mock)
      .mockResolvedValueOnce({ id: 'inv-1' })
      .mockResolvedValueOnce({ id: 'inv-2' });
    (billDocumentService.buildPdfData as jest.Mock)
      .mockResolvedValueOnce({ invoice: { invoiceNumber: 'BINV-1' } })
      .mockResolvedValueOnce({ invoice: { invoiceNumber: 'BINV-2' } });
    (billPdfService.renderMerged as jest.Mock).mockResolvedValueOnce(Buffer.from('%PDF merged'));

    const result = await service.drainCurrentTenant();

    expect(result).toEqual({ jobsDrained: 1, invoicesProcessed: 2 });
    expect(billPdfService.renderMerged).toHaveBeenCalledWith([
      { invoice: { invoiceNumber: 'BINV-1' } },
      { invoice: { invoiceNumber: 'BINV-2' } },
    ]);
    expect(storageService.putObject).toHaveBeenCalledWith(
      'tenant_demo/bill-print-job/job-1-v1.pdf', Buffer.from('%PDF merged'), 'application/pdf',
    );
    expect(tenantPrisma.execute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'RUNNING'"), 'job-1',
    );
    expect(tenantPrisma.execute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'COMPLETED'"),
      'job-1',
      'tenant_demo/bill-print-job/job-1-v1.pdf',
    );
  });

  it('records a per-invoice failure and still completes with the remaining invoices', async () => {
    const job = makeJob();
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([job]);
    (billInvoiceService.findOne as jest.Mock)
      .mockRejectedValueOnce(new Error('Invoice inv-1 not found'))
      .mockResolvedValueOnce({ id: 'inv-2' });
    (billDocumentService.buildPdfData as jest.Mock).mockResolvedValueOnce({ invoice: { invoiceNumber: 'BINV-2' } });
    (billPdfService.renderMerged as jest.Mock).mockResolvedValueOnce(Buffer.from('%PDF merged'));

    const result = await service.drainCurrentTenant();

    expect(result.invoicesProcessed).toBe(1);
    expect(billPdfService.renderMerged).toHaveBeenCalledWith([{ invoice: { invoiceNumber: 'BINV-2' } }]);
    expect(tenantPrisma.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE bill_print_jobs'),
      'job-1',
      1,
      JSON.stringify([{ invoiceId: 'inv-1', error: 'Invoice inv-1 not found' }]),
    );
  });

  it('a job whose every invoice fails is marked FAILED, not stored as an empty PDF', async () => {
    const job = makeJob({ invoice_ids: ['inv-1'] });
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([job]);
    (billInvoiceService.findOne as jest.Mock).mockRejectedValueOnce(new Error('Invoice inv-1 not found'));

    const result = await service.drainCurrentTenant();

    expect(result.jobsDrained).toBe(0);
    expect(billPdfService.renderMerged).not.toHaveBeenCalled();
    expect(storageService.putObject).not.toHaveBeenCalled();
    expect(tenantPrisma.execute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'FAILED'"), 'job-1',
    );
  });

  it('a storage/render failure marks the job FAILED and does not abort the tenant drain', async () => {
    const job = makeJob();
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([job]);
    (billInvoiceService.findOne as jest.Mock).mockResolvedValue({ id: 'inv-1' });
    (billDocumentService.buildPdfData as jest.Mock).mockResolvedValue({ invoice: {} });
    (billPdfService.renderMerged as jest.Mock).mockRejectedValueOnce(new Error('pdfkit exploded'));

    const result = await service.drainCurrentTenant();

    expect(result.jobsDrained).toBe(0);
    expect(tenantPrisma.execute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'FAILED'"), 'job-1',
    );
  });

  it('resumes a RUNNING job without a redundant PENDING->RUNNING transition', async () => {
    const job = makeJob({ status: 'RUNNING' });
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([job]);
    (billInvoiceService.findOne as jest.Mock).mockResolvedValue({ id: 'inv-1' });
    (billDocumentService.buildPdfData as jest.Mock).mockResolvedValue({ invoice: {} });
    (billPdfService.renderMerged as jest.Mock).mockResolvedValueOnce(Buffer.from('%PDF'));

    await service.drainCurrentTenant();

    expect(tenantPrisma.execute).not.toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'RUNNING'"), 'job-1',
    );
  });
});
