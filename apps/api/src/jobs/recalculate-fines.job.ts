import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../modules/tenant/tenant-context.service';
import { InvoiceService } from '../modules/finance/invoice.service';

const QUEUE_NAME = 'recalculate-fines';
const JOB_NAME = 'daily-recalculate';

/**
 * Schedules + processes the daily fine recalculation job.
 * Cron: '20 18 * * *' = 00:05 Nepal time (UTC+5:45)
 *
 * For now processes invoices across all active tenants.
 */
@Injectable()
export class RecalculateFinesScheduler implements OnModuleInit {
  constructor(@InjectQueue(QUEUE_NAME) private readonly queue: Queue) {}

  async onModuleInit() {
    await this.queue.add(
      JOB_NAME,
      {},
      {
        repeat: { pattern: '20 18 * * *' },
        jobId: JOB_NAME,
        removeOnComplete: true,
      },
    );
  }
}

@Processor(QUEUE_NAME)
export class RecalculateFinesProcessor extends WorkerHost {
  private readonly logger = new Logger(RecalculateFinesProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly invoiceService: InvoiceService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Running fine recalculation job: ${job.id}`);

    // Get all active tenants
    const tenants = await this.prisma.$queryRaw<{ id: string; slug: string }[]>`
      SELECT t.id, t.slug
      FROM tenants t
      JOIN subscriptions s ON s.tenant_id = t.id AND s.status = 'ACTIVE'
      WHERE t.deleted_at IS NULL
    `;

    for (const tenant of tenants) {
      try {
        await this.tenantContext.run(
          {
            tenantId: tenant.id,
            slug: tenant.slug,
            schemaName: `tenant_${tenant.slug}`,
          },
          () => this.recalculateForTenant(tenant.slug),
        );
      } catch (err) {
        this.logger.error(`Fine recalculation failed for tenant ${tenant.slug}`, err);
      }
    }
  }

  private async recalculateForTenant(slug: string): Promise<void> {
    // Get all UNPAID + PARTIAL invoices past due date
    const overdueInvoices = await this.invoiceService.findAll({
      status: 'UNPAID',
    });
    const partialInvoices = await this.invoiceService.findAll({
      status: 'PARTIAL',
    });

    const allInvoices = [...overdueInvoices.data, ...partialInvoices.data];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let processed = 0;
    for (const invoice of allInvoices) {
      const dueDate = new Date(invoice.dueDate.ad);
      dueDate.setHours(0, 0, 0, 0);
      if (dueDate < today) {
        await this.invoiceService.recalculateFine(invoice.id);
        processed++;
      }
    }

    this.logger.log(`Tenant ${slug}: recalculated fines for ${processed} invoices`);
  }
}
