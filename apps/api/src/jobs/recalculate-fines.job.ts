import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../modules/tenant/tenant-context.service';
import { TenantService } from '../modules/tenant/tenant.service';
import { InvoiceService } from '../modules/finance/invoice.service';
import { todayAdInNepal } from '../modules/common/utils/date.util';

export interface FineRunSummary {
  trigger: 'cron' | 'manual';
  tenants: number;
  failedTenants: string[];
  recalculated: number;
  ms: number;
}

/**
 * Daily fine recalculation (OPS-1 T4 — resurrected from the silently-dead
 * BullMQ version). The work is a sequential in-process loop with no queue
 * semantics, so it runs on @nestjs/schedule — no Redis required, no silent
 * death: registration is logged at boot and every run logs start + summary.
 *
 * Kathmandu-timezone cron: 00:05 Nepal time daily (school-day boundaries are
 * Nepal-local). Manual trigger: POST /api/v1/super-admin/jobs/recalculate-fines
 * (PLATFORM_ADMIN) — the per-invoice variant remains at
 * PATCH /finance/invoices/:id/recalculate-fine.
 */
@Injectable()
export class RecalculateFinesService implements OnModuleInit {
  private readonly logger = new Logger(RecalculateFinesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly invoiceService: InvoiceService,
  ) {}

  onModuleInit(): void {
    this.logger.log(
      `Fine-recalculation cron registered: '5 0 * * *' Asia/Kathmandu (daily 00:05 Nepal time)`,
    );
  }

  @Cron('5 0 * * *', { name: 'recalculate-fines', timeZone: 'Asia/Kathmandu' })
  async handleCron(): Promise<void> {
    await this.run('cron');
  }

  async run(trigger: 'cron' | 'manual'): Promise<FineRunSummary> {
    const start = Date.now();
    this.logger.log(`Fine recalculation started (trigger=${trigger})`);

    // Model API, not raw SQL: the dead BullMQ version's query used snake_case
    // columns that don't exist in the Prisma-managed public schema, and its
    // status='ACTIVE' filter matched zero tenants (every school is TRIAL in
    // dev). Fines accrue for any school that isn't cancelled/expired.
    const tenants = await this.prisma.tenant.findMany({
      where: {
        deletedAt: null,
        subscription: {
          status: {
            in: [
              SubscriptionStatus.TRIAL,
              SubscriptionStatus.ACTIVE,
              SubscriptionStatus.PAST_DUE,
            ],
          },
        },
      },
      select: { id: true, slug: true },
    });

    let recalculated = 0;
    const failedTenants: string[] = [];
    for (const tenant of tenants) {
      try {
        const count = await this.tenantContext.run(
          {
            tenantId: tenant.id,
            slug: tenant.slug,
            // The dead BullMQ version built `tenant_${slug}` by hand, which is
            // wrong for dash-containing slugs (motherland-school). Use the
            // canonical mapping.
            schemaName: TenantService.schemaNameFor(tenant.slug),
          },
          () => this.recalculateForTenant(tenant.slug),
        );
        recalculated += count;
      } catch (err) {
        failedTenants.push(tenant.slug);
        this.logger.error(`Fine recalculation failed for tenant ${tenant.slug}`, err);
      }
    }

    const ms = Date.now() - start;
    const summary: FineRunSummary = {
      trigger,
      tenants: tenants.length,
      failedTenants,
      recalculated,
      ms,
    };
    this.logger.log(
      `Fine recalculation finished (trigger=${trigger}): tenants=${tenants.length} ` +
        `failed=${failedTenants.length} recalculated=${recalculated} ms=${ms}`,
    );
    return summary;
  }

  private async recalculateForTenant(slug: string): Promise<number> {
    const overdueInvoices = await this.invoiceService.findAll({ status: 'UNPAID' });
    const partialInvoices = await this.invoiceService.findAll({ status: 'PARTIAL' });

    const allInvoices = [...overdueInvoices.data, ...partialInvoices.data];
    // QA-1 OBS-E-2 / decision 2: compare against Nepal's calendar today, not the
    // server-local midnight. dueDate.ad is already 'YYYY-MM-DD', so a lexical
    // string compare is a correct, TZ-independent date ordering.
    const todayAd = todayAdInNepal();

    let processed = 0;
    for (const invoice of allInvoices) {
      if (invoice.dueDate.ad < todayAd) {
        await this.invoiceService.recalculateFine(invoice.id);
        processed++;
      }
    }

    this.logger.log(`Tenant ${slug}: recalculated fines for ${processed} invoices`);
    return processed;
  }
}
