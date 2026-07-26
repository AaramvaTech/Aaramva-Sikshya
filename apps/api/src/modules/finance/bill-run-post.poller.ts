import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantService } from '../tenant/tenant.service';
import { BillRunPostRunnerService } from './bill-run-post-runner.service';

/**
 * BILL-4-SPEC.md §3 — posting "runs as a background job... because a
 * whole-school post can be thousands of invoices on 1 vCPU." Same shape as
 * BulkAssignPoller (BILL-2): a @nestjs/schedule interval iterates tenants
 * and drains each tenant's POSTING bill_runs. No BullMQ (removed in OPS-1).
 * 10s interval, matching BulkAssignPoller's own reasoning — a post is a
 * bounded, one-shot admin action, not a steady trickle.
 */
@Injectable()
export class BillRunPostPoller implements OnModuleInit {
  private readonly logger = new Logger(BillRunPostPoller.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly runner: BillRunPostRunnerService,
  ) {}

  onModuleInit(): void {
    this.logger.log('Bill-run post poller registered: every 10s');
  }

  @Interval('bill-run-post-poll', 10000)
  async handleInterval(): Promise<void> {
    if (process.env.BILL_RUN_POST_POLL === 'false') return; // test/proof override
    await this.runAllTenants();
  }

  /** Drain every tenant's POSTING runs once. Also the manual/proof entry point. */
  async runAllTenants(): Promise<{ tenants: number; runsProcessed: number; linesPosted: number; linesFailed: number }> {
    const tenants = await this.prisma.tenant.findMany({
      where: { deletedAt: null },
      select: { id: true, slug: true },
    });
    let runsProcessed = 0;
    let linesPosted = 0;
    let linesFailed = 0;
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
        runsProcessed += result.runsProcessed;
        linesPosted += result.linesPosted;
        linesFailed += result.linesFailed;
      } catch (err) {
        this.logger.error(`Bill-run post drain failed for tenant ${t.slug}`, err as Error);
      }
    }
    return { tenants: tenants.length, runsProcessed, linesPosted, linesFailed };
  }
}
