import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { PublicPrismaService } from '../super-admin/public-prisma.service';
import { StorageService } from '../storage/storage.service';
import { resolvePrintLanguage } from './bill-print-labels';
import { PrintClassDto } from './dto/bill-print-job.dto';
import { BillPrintJobRow, toBillPrintJobResponse, BillPrintJobResponseDto } from './entities/bill-print-job.entity';

/**
 * BILL-8 Checkpoint C (B8-9): creates bill_print_jobs rows. Mirrors
 * BulkAssignJobService — the invoice id list is resolved to a concrete list
 * ONCE, here, and frozen onto the job row (`invoice_ids`); BillPrintRunnerService
 * never re-derives it, so an invoice posted after job creation doesn't
 * silently get pulled into an already-created job.
 */
@Injectable()
export class BillPrintJobService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly publicPrisma: PublicPrismaService,
    private readonly storageService: StorageService,
  ) {}

  private async resolveLanguage(languageOverride?: string): Promise<string> {
    const { tenantId } = this.tenantContext.getOrThrow();
    const rows = await this.publicPrisma.query<{ print_language: string | null }>(
      `SELECT "printLanguage" AS print_language FROM tenants WHERE id = $1`,
      tenantId,
    );
    return resolvePrintLanguage(rows[0]?.print_language, languageOverride);
  }

  async createForRun(
    runId: string,
    createdById: string,
    languageOverride?: string,
  ): Promise<BillPrintJobResponseDto> {
    const runRows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM bill_runs WHERE id = $1::uuid AND deleted_at IS NULL`,
      runId,
    );
    if (!runRows[0]) throw new NotFoundException(`Bill run ${runId} not found`);

    // "Posted invoices" means real, issued invoices — POSTED, PARTIALLY_PAID,
    // or SETTLED all qualify (bill_invoices_status_check's four values); only
    // VOIDED is excluded. A literal status='POSTED' would silently drop every
    // invoice that's since been paid off, which is exactly when a bulk
    // print — handing out bills/receipts after a run — is most wanted.
    const invoiceRows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM bill_invoices
       WHERE bill_run_id = $1::uuid AND status != 'VOIDED' AND deleted_at IS NULL
       ORDER BY created_at`,
      runId,
    );
    const invoiceIds = invoiceRows.map((r) => r.id);
    if (invoiceIds.length === 0) {
      throw new BadRequestException(`Bill run ${runId} has no postable invoices to print`);
    }
    const language = await this.resolveLanguage(languageOverride);

    const rows = await this.tenantPrisma.query<BillPrintJobRow>(
      `INSERT INTO bill_print_jobs (job_type, ref_run_id, invoice_ids, language, total, created_by)
       VALUES ('RUN', $1::uuid, $2::jsonb, $3, $4, $5::uuid)
       RETURNING *`,
      runId,
      JSON.stringify(invoiceIds),
      language,
      invoiceIds.length,
      createdById,
    );
    return toBillPrintJobResponse(rows[0]);
  }

  async createForClass(dto: PrintClassDto, createdById: string, languageOverride?: string): Promise<BillPrintJobResponseDto> {
    const conditions = [
      's.class_id = $1::uuid', 'bi.bs_year = $2', 'bi.bs_month = $3',
      "bi.status != 'VOIDED'", 'bi.deleted_at IS NULL', 's.deleted_at IS NULL',
    ];
    const params: unknown[] = [dto.classId, dto.bsYear, dto.bsMonth];
    if (dto.sectionId) {
      conditions.push(`s.section_id = $${params.length + 1}::uuid`);
      params.push(dto.sectionId);
    }
    const invoiceRows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT bi.id FROM bill_invoices bi
       JOIN students s ON s.id = bi.student_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY bi.created_at`,
      ...params,
    );
    const invoiceIds = invoiceRows.map((r) => r.id);
    if (invoiceIds.length === 0) {
      throw new BadRequestException('No posted invoices found for this class and period');
    }
    const language = await this.resolveLanguage(languageOverride);

    const rows = await this.tenantPrisma.query<BillPrintJobRow>(
      `INSERT INTO bill_print_jobs
         (job_type, ref_class_id, ref_section_id, ref_bs_year, ref_bs_month, invoice_ids, language, total, created_by)
       VALUES ('CLASS', $1::uuid, $2::uuid, $3, $4, $5::jsonb, $6, $7, $8::uuid)
       RETURNING *`,
      dto.classId,
      dto.sectionId ?? null,
      dto.bsYear,
      dto.bsMonth,
      JSON.stringify(invoiceIds),
      language,
      invoiceIds.length,
      createdById,
    );
    return toBillPrintJobResponse(rows[0]);
  }

  async findOne(id: string): Promise<BillPrintJobResponseDto> {
    const rows = await this.tenantPrisma.query<BillPrintJobRow>(
      `SELECT * FROM bill_print_jobs WHERE id = $1::uuid`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Job ${id} not found`);
    const job = rows[0];
    if (job.status === 'COMPLETED' && job.result_key) {
      const downloadUrl = await this.storageService.presignRead(job.result_key);
      return toBillPrintJobResponse(job, downloadUrl);
    }
    return toBillPrintJobResponse(job);
  }
}
