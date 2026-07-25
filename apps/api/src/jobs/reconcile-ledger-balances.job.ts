import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../modules/tenant/tenant-context.service';
import { TenantService } from '../modules/tenant/tenant.service';
import { LedgerService } from '../modules/finance/ledger.service';

export interface ReconcileRunSummary {
  trigger: 'cron' | 'manual';
  tenants: number;
  failedTenants: string[];
  checked: number;
  drifted: number;
  ms: number;
}

/**
 * BILL-3 §7 — "A nightly reconciliation job recomputes every student's
 * balance from the ledger and logs any drift as an incident." Same shape as
 * RecalculateFinesService: @nestjs/schedule, no queue, sequential per-tenant
 * loop, shared run() for both cron and the manual trigger, one tenant's
 * failure never aborts the run.
 *
 * Nepal-local 00:30 daily — after the 00:05 fine-recalculation job, since
 * both touch finance data and neither needs to race the other.
 */
@Injectable()
export class ReconcileLedgerBalancesService implements OnModuleInit {
  private readonly logger = new Logger(ReconcileLedgerBalancesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly ledgerService: LedgerService,
  ) {}

  onModuleInit(): void {
    this.logger.log(
      `Ledger-reconciliation cron registered: '30 0 * * *' Asia/Kathmandu (daily 00:30 Nepal time)`,
    );
  }

  @Cron('30 0 * * *', { name: 'reconcile-ledger-balances', timeZone: 'Asia/Kathmandu' })
  async handleCron(): Promise<void> {
    await this.run('cron');
  }

  async run(trigger: 'cron' | 'manual'): Promise<ReconcileRunSummary> {
    const start = Date.now();
    this.logger.log(`Ledger reconciliation started (trigger=${trigger})`);

    const tenants = await this.prisma.tenant.findMany({
      where: {
        deletedAt: null,
        subscription: {
          status: { in: [SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
        },
      },
      select: { id: true, slug: true },
    });

    let checked = 0;
    let drifted = 0;
    const failedTenants: string[] = [];
    for (const tenant of tenants) {
      try {
        const result = await this.tenantContext.run(
          {
            tenantId: tenant.id,
            slug: tenant.slug,
            schemaName: TenantService.schemaNameFor(tenant.slug),
          },
          () => this.ledgerService.reconcile(),
        );
        checked += result.checked;
        drifted += result.drifted.length;
        if (result.drifted.length > 0) {
          this.logger.error(
            `Ledger drift corrected for tenant ${tenant.slug}: ${result.drifted.length} student(s) — ${result.drifted.join(', ')}`,
          );
        }
      } catch (err) {
        failedTenants.push(tenant.slug);
        this.logger.error(`Ledger reconciliation failed for tenant ${tenant.slug}`, err as Error);
      }
    }

    const ms = Date.now() - start;
    const summary: ReconcileRunSummary = { trigger, tenants: tenants.length, failedTenants, checked, drifted, ms };
    this.logger.log(
      `Ledger reconciliation finished (trigger=${trigger}): tenants=${tenants.length} ` +
        `failed=${failedTenants.length} checked=${checked} drifted=${drifted} ms=${ms}`,
    );
    return summary;
  }
}
