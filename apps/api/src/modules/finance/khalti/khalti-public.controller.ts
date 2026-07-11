import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { TenantService } from '../../tenant/tenant.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { KhaltiService } from './khalti.service';

/**
 * Public Khalti surface — the payer's browser arrives here with no auth header
 * and no X-Tenant-Slug, so every route carries the tenant slug in its path and
 * resolves context programmatically (excluded from TenantMiddleware in
 * AppModule, mirroring the eSewa public controller).
 *
 * None of these routes moves money on their own: the callback only triggers
 * the server-to-server lookup verification; its query params are stored as a
 * dispute hint and never trusted.
 */
@Controller('finance/payments/khalti/public')
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class KhaltiPublicController {
  constructor(
    private readonly khaltiService: KhaltiService,
    private readonly tenantService: TenantService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private async inTenant<T>(slug: string, fn: () => Promise<T>): Promise<T> {
    const context = await this.tenantService.resolveBySlug(slug);
    return this.tenantContext.run(context, fn);
  }

  /**
   * Redirect to Khalti's hosted payment page — what mobile opens in the
   * system browser. Plain 302 (Khalti hosts the UI; no form, no CSP carve-out).
   */
  @Get('pay/:slug/:transactionUuid')
  async pay(
    @Param('slug') slug: string,
    @Param('transactionUuid') transactionUuid: string,
    @Res() res: Response,
  ): Promise<void> {
    const target = await this.inTenant(slug, () =>
      this.khaltiService.buildPayRedirect(slug, transactionUuid),
    );
    res.redirect(target);
  }

  /**
   * Khalti's single return_url. Query params (pidx, status, transaction_id…)
   * are a hint — verification always goes through the lookup API.
   */
  @Get('callback/:slug/:transactionUuid')
  async callback(
    @Param('slug') slug: string,
    @Param('transactionUuid') transactionUuid: string,
    @Query() query: Record<string, unknown>,
    @Res() res: Response,
  ): Promise<void> {
    const target = await this.inTenant(slug, () =>
      this.khaltiService.handleCallback(slug, transactionUuid, query),
    );
    res.redirect(target);
  }

  /** PII-free receipt for the web result pages (invoice ref + amount + state). */
  @Get('receipt/:slug/:transactionUuid')
  getReceipt(
    @Param('slug') slug: string,
    @Param('transactionUuid') transactionUuid: string,
  ) {
    return this.inTenant(slug, () => this.khaltiService.getReceipt(transactionUuid));
  }
}
