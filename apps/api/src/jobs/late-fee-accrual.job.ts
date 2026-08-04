import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../modules/tenant/tenant-context.service';
import { TenantService } from '../modules/tenant/tenant.service';
import { TenantPrismaService } from '../modules/tenant/tenant-prisma.service';
import { BillFineService } from '../modules/finance/bill-fine.service';
import { Money } from '../common/money/money';

export interface LateFeeAccrualRunSummary {
  trigger: 'cron' | 'manual';
  tenants: number;
  failedTenants: string[];
  invoicesScanned: number;
  invoicesFined: number;
  totalFinePosted: number;
  ms: number;
}

/**
 * BILL-7-SPEC.md §7 Checkpoint B. Same shape as RecalculateFinesService /
 * ReconcileLedgerBalancesService: @nestjs/schedule, no queue, sequential
 * per-tenant loop, shared run() for both cron and the manual trigger
 * (`POST /super-admin/jobs/late-fee-accrual`), one tenant's failure never
 * aborts the run. Runs EVERY active tenant unconditionally — B7-4's
 * "off by default" is already the engine's own is_enabled-rule short-circuit
 * (BillFineService.runLateFees completes fast with zero scanned/fined when a
 * tenant has no enabled rule), so no separate "which tenants have late fees
 * on" pre-filter is needed here.
 *
 * Nepal-local 00:10 daily — after the legacy 00:05 fine-recalculation job
 * and before the 00:30 ledger-reconciliation job, so this job's own ledger
 * writes are settled before reconciliation reads the day's balances.
 *
 * System-actor ruling (confirmed 2026-08-04): a SCHEDULED run has no human
 * triggering it, but student_ledger_entries.created_by is a NOT NULL FK.
 * Resolved to the tenant's own SCHOOL_OWNER (earliest by created_at, always
 * present — TenantProvisioningService creates one at registration) rather
 * than a new platform-level system-user concept: created_by isn't rendered
 * in any current UI (grepped apps/web — zero hits in any ledger/statement
 * view), and bill_fine_runs.triggered_by='SCHEDULED' + fine_run_id already
 * give complete, unambiguous machine disambiguation for any real audit. A
 * dedicated system identity is real, non-speculative future work for if a
 * SECOND automated financial poster ever needs one — not preemptively here.
 */
@Injectable()
export class LateFeeAccrualService implements OnModuleInit {
  private readonly logger = new Logger(LateFeeAccrualService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly billFineService: BillFineService,
  ) {}

  onModuleInit(): void {
    this.logger.log(
      `Late-fee accrual cron registered: '10 0 * * *' Asia/Kathmandu (daily 00:10 Nepal time)`,
    );
  }

  @Cron('10 0 * * *', { name: 'late-fee-accrual', timeZone: 'Asia/Kathmandu' })
  async handleCron(): Promise<void> {
    await this.run('cron');
  }

  async run(trigger: 'cron' | 'manual'): Promise<LateFeeAccrualRunSummary> {
    const start = Date.now();
    this.logger.log(`Late-fee accrual run started (trigger=${trigger})`);

    const tenants = await this.prisma.tenant.findMany({
      where: {
        deletedAt: null,
        subscription: {
          status: { in: [SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
        },
      },
      select: { id: true, slug: true },
    });

    let invoicesScanned = 0;
    let invoicesFined = 0;
    let totalFinePosted = Money.zero();
    const failedTenants: string[] = [];

    for (const tenant of tenants) {
      try {
        const result = await this.tenantContext.run(
          {
            tenantId: tenant.id,
            slug: tenant.slug,
            schemaName: TenantService.schemaNameFor(tenant.slug),
          },
          () => this.runForTenant(),
        );
        invoicesScanned += result.invoicesScanned;
        invoicesFined += result.invoicesFined;
        totalFinePosted = totalFinePosted.add(Money.fromNumber(result.totalFinePosted));
      } catch (err) {
        failedTenants.push(tenant.slug);
        this.logger.error(`Late-fee accrual failed for tenant ${tenant.slug}`, err as Error);
      }
    }

    const ms = Date.now() - start;
    const summary: LateFeeAccrualRunSummary = {
      trigger,
      tenants: tenants.length,
      failedTenants,
      invoicesScanned,
      invoicesFined,
      totalFinePosted: totalFinePosted.toNumber(),
      ms,
    };
    this.logger.log(
      `Late-fee accrual run finished (trigger=${trigger}): tenants=${tenants.length} ` +
        `failed=${failedTenants.length} scanned=${invoicesScanned} fined=${invoicesFined} ` +
        `totalFinePosted=${totalFinePosted.toNumber()} ms=${ms}`,
    );
    return summary;
  }

  private async runForTenant() {
    const ownerRows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM users WHERE role = 'SCHOOL_OWNER' AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`,
    );
    const owner = ownerRows[0];
    if (!owner) {
      throw new Error('No resolvable SCHOOL_OWNER — cannot attribute scheduled fines');
    }
    return this.billFineService.runLateFees('SCHEDULED', owner.id);
  }
}
