import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantService } from '../tenant/tenant.service';
import { CredentialDeliveryService } from './credential-delivery.service';
import { credentialKeyConfigured } from './credential-crypto.util';

/**
 * REG-1 §4 (REG-OBS-3 ruling) — the outbox poller. NO BullMQ. A @nestjs/schedule
 * interval iterates tenants (like the fine-recalc job) and drains each tenant's
 * PENDING credential deliveries. Idle when CREDENTIAL_SECRET_KEY is unset, or when
 * CREDENTIAL_DELIVERY_POLL=false (test/proof override — use the manual trigger).
 */
// REG-1 credential-delivery poller (outbox drain).
@Injectable()
export class CredentialDeliveryPoller implements OnModuleInit {
  private readonly logger = new Logger(CredentialDeliveryPoller.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly delivery: CredentialDeliveryService,
  ) {}

  onModuleInit(): void {
    if (!credentialKeyConfigured()) {
      this.logger.warn(
        'CREDENTIAL_SECRET_KEY not set — credential-delivery poller is IDLE (temp passwords cannot be encrypted/decrypted).',
      );
      return;
    }
    this.logger.log(
      `Credential-delivery poller registered: every 60s (SMS_DRY_RUN=${process.env.SMS_DRY_RUN ?? 'false'})`,
    );
  }

  @Interval('credential-delivery-poll', 60000)
  async handleInterval(): Promise<void> {
    if (process.env.CREDENTIAL_DELIVERY_POLL === 'false') return; // test/proof override
    if (!credentialKeyConfigured()) return;
    await this.runAllTenants();
  }

  /** Drain every tenant's outbox once. Also the manual/proof entry point. */
  async runAllTenants(): Promise<{
    tenants: number;
    sent: number;
    dry: number;
    failed: number;
  }> {
    const tenants = await this.prisma.tenant.findMany({
      where: { deletedAt: null },
      select: { id: true, slug: true },
    });
    let sent = 0;
    let dry = 0;
    let failed = 0;
    for (const t of tenants) {
      try {
        const tally = await this.tenantContext.run(
          {
            tenantId: t.id,
            slug: t.slug,
            schemaName: TenantService.schemaNameFor(t.slug),
          },
          () => this.delivery.drainCurrentTenant(),
        );
        sent += tally.sent;
        dry += tally.dry;
        failed += tally.failed;
      } catch (err) {
        this.logger.error(
          `Credential delivery drain failed for tenant ${t.slug}`,
          err as Error,
        );
      }
    }
    return { tenants: tenants.length, sent, dry, failed };
  }
}
