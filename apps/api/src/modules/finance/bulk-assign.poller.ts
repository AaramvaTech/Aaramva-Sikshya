import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantService } from '../tenant/tenant.service';
import { BulkAssignRunnerService } from './bulk-assign-runner.service';

/**
 * BILL-2 §6 — bulk-assign background job runner. Same shape as
 * CredentialDeliveryPoller (REG-1): a @nestjs/schedule interval iterates
 * tenants and drains each tenant's PENDING/RUNNING bulk_assign_jobs. No
 * BullMQ (removed in OPS-1). 10s interval — a bulk-assign job is a bounded,
 * one-shot admin action (not a steady trickle like credential delivery), so
 * a short interval keeps live-proof/UI wait times low without meaningfully
 * increasing idle DB load (the query is a cheap, indexed, usually-empty scan).
 */
@Injectable()
export class BulkAssignPoller implements OnModuleInit {
  private readonly logger = new Logger(BulkAssignPoller.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly runner: BulkAssignRunnerService,
  ) {}

  onModuleInit(): void {
    this.logger.log('Bulk-assign job poller registered: every 10s');
  }

  @Interval('bulk-assign-poll', 10000)
  async handleInterval(): Promise<void> {
    if (process.env.BULK_ASSIGN_POLL === 'false') return; // test/proof override
    await this.runAllTenants();
  }

  /** Drain every tenant's job queue once. Also the manual/proof entry point. */
  async runAllTenants(): Promise<{ tenants: number; jobsDrained: number; studentsProcessed: number }> {
    const tenants = await this.prisma.tenant.findMany({
      where: { deletedAt: null },
      select: { id: true, slug: true },
    });
    let jobsDrained = 0;
    let studentsProcessed = 0;
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
        studentsProcessed += result.studentsProcessed;
      } catch (err) {
        this.logger.error(`Bulk-assign drain failed for tenant ${t.slug}`, err as Error);
      }
    }
    return { tenants: tenants.length, jobsDrained, studentsProcessed };
  }
}
