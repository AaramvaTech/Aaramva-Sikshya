import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { StorageService } from '../storage/storage.service';
import { BillInvoiceService } from './bill-invoice.service';
import { BillDocumentService } from './bill-document.service';
import { BillPdfService, BillPdfData } from './bill-pdf.service';
import { PrintLanguage } from './bill-print-labels';
import { BillPrintJobRow } from './entities/bill-print-job.entity';

/**
 * BILL-8 Checkpoint C: bulk-print job runner. Same poller-drained shape as
 * BulkAssignRunnerService, but a print job's unit of work is "render this
 * invoice into the shared merged doc", not "write this DB row" — there's no
 * transactional per-chunk resumability to gain here (a half-drawn pdfkit
 * document lives only in memory; a crash mid-job leaves no artifact at all,
 * so re-running the poller on a still-RUNNING/PENDING job just starts over).
 * Progress (`processed`) is still updated live, per invoice, purely for
 * status-endpoint visibility during the run.
 */
@Injectable()
export class BillPrintRunnerService {
  private readonly logger = new Logger(BillPrintRunnerService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly storageService: StorageService,
    private readonly billInvoiceService: BillInvoiceService,
    private readonly billDocumentService: BillDocumentService,
    private readonly billPdfService: BillPdfService,
  ) {}

  private keyFor(slug: string, jobId: string): string {
    // B8-11: deterministic, immutable per completed job — a bill_print_jobs
    // row only ever runs once (the poller only touches PENDING/RUNNING), so
    // unlike the single-invoice cache key there's no headObject-before-render
    // check needed here.
    return `tenant_${slug}/bill-print-job/${jobId}-v1.pdf`;
  }

  /** Drains every PENDING/RUNNING job in the CURRENT tenant. Call inside tenantContext.run(). */
  async drainCurrentTenant(): Promise<{ jobsDrained: number; invoicesProcessed: number }> {
    const jobs = await this.tenantPrisma.query<BillPrintJobRow>(
      `SELECT * FROM bill_print_jobs WHERE status IN ('PENDING','RUNNING') ORDER BY created_at`,
    );
    let jobsDrained = 0;
    let invoicesProcessed = 0;
    for (const job of jobs) {
      try {
        const result = await this.runJob(job);
        invoicesProcessed += result.invoicesProcessed;
        jobsDrained++;
      } catch (err) {
        this.logger.error(`Bill-print job ${job.id} failed`, err as Error);
        await this.tenantPrisma.execute(
          `UPDATE bill_print_jobs SET status = 'FAILED' WHERE id = $1::uuid`,
          job.id,
        );
      }
    }
    return { jobsDrained, invoicesProcessed };
  }

  private async runJob(job: BillPrintJobRow): Promise<{ invoicesProcessed: number }> {
    if (job.status === 'PENDING') {
      await this.tenantPrisma.execute(
        `UPDATE bill_print_jobs SET status = 'RUNNING', started_at = NOW()
         WHERE id = $1::uuid AND status = 'PENDING'`,
        job.id,
      );
    }

    const tenant = await this.billDocumentService.loadTenantHeader();
    const language = job.language as PrintLanguage;
    const dataList: BillPdfData[] = [];

    for (const invoiceId of job.invoice_ids) {
      let failure: { invoiceId: string; error: string } | null = null;
      try {
        const invoice = await this.billInvoiceService.findOne(invoiceId);
        const data = await this.billDocumentService.buildPdfData(invoice, tenant, language);
        dataList.push(data);
      } catch (err) {
        failure = { invoiceId, error: (err as Error).message };
      }
      await this.tenantPrisma.execute(
        `UPDATE bill_print_jobs
           SET processed = processed + 1,
               failed_count = failed_count + $2,
               failures = failures || $3::jsonb
         WHERE id = $1::uuid`,
        job.id,
        failure ? 1 : 0,
        JSON.stringify(failure ? [failure] : []),
      );
    }

    if (dataList.length === 0) {
      throw new Error('All invoices in this print job failed to render');
    }

    const buffer = await this.billPdfService.renderMerged(dataList);
    const { slug } = this.tenantContext.getOrThrow();
    const key = this.keyFor(slug, job.id);
    await this.storageService.putObject(key, buffer, 'application/pdf');

    await this.tenantPrisma.execute(
      `UPDATE bill_print_jobs SET status = 'COMPLETED', completed_at = NOW(), result_key = $2
       WHERE id = $1::uuid AND status = 'RUNNING'`,
      job.id,
      key,
    );
    return { invoicesProcessed: dataList.length };
  }
}
