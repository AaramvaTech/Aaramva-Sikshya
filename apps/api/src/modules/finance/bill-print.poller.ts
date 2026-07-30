import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantService } from '../tenant/tenant.service';
import { BillPrintRunnerService } from './bill-print-runner.service';

/**
 * BILL-8 Checkpoint C (B8-9) — bulk-print job poller. Same shape as
 * BulkAssignPoller: a @nestjs/schedule interval iterates tenants and drains
 * each tenant's PENDING/RUNNING bill_print_jobs. No BullMQ (removed in
 * OPS-1). 10s interval — same "bounded, one-shot admin action" reasoning.
 */
@Injectable()
export class BillPrintPoller implements OnModuleInit {
  private readonly logger = new Logger(BillPrintPoller.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly runner: BillPrintRunnerService,
  ) {}

  onModuleInit(): void {
    this.logger.log('Bill-print job poller registered: every 10s');
  }

  @Interval('bill-print-poll', 10000)
  async handleInterval(): Promise<void> {
    if (process.env.BILL_PRINT_POLL === 'false') return; // test/proof override
    await this.runAllTenants();
  }

  /** Drain every tenant's job queue once. Also the manual/proof entry point. */
  async runAllTenants(): Promise<{ tenants: number; jobsDrained: number; invoicesProcessed: number }> {
    const tenants = await this.prisma.tenant.findMany({
      where: { deletedAt: null },
      select: { id: true, slug: true },
    });
    let jobsDrained = 0;
    let invoicesProcessed = 0;
    for (const t of tenants) {
      try {
        const result = await this.tenantContext.run(
          {
            tenantId: t.id,
            slug: t.slug,
            schemaName: TenantService.schemaNameFor(t.slug),
          },
          () => this.runner.drainCurrentTenant(),
        );
        jobsDrained += result.jobsDrained;
        invoicesProcessed += result.invoicesProcessed;
      } catch (err) {
        this.logger.error(`Bill-print drain failed for tenant ${t.slug}`, err as Error);
      }
    }
    return { tenants: tenants.length, jobsDrained, invoicesProcessed };
  }
}
