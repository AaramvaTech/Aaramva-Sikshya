import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { TenantService } from '../../tenant/tenant.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { EsewaService } from './esewa.service';

/**
 * Public eSewa surface — the payer's browser arrives here with no auth header
 * and no X-Tenant-Slug, so every route carries the tenant slug in its path and
 * resolves context programmatically (excluded from TenantMiddleware in
 * AppModule, mirroring /tenants/verify).
 *
 * None of these routes moves money on their own: callbacks only trigger the
 * server-to-server status-check verification; the redirect payload is stored
 * as a dispute hint and never trusted.
 */
@Controller('finance/payments/esewa/public')
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class EsewaPublicController {
  constructor(
    private readonly esewaService: EsewaService,
    private readonly tenantService: TenantService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private async inTenant<T>(slug: string, fn: () => Promise<T>): Promise<T> {
    const context = await this.tenantService.resolveBySlug(slug);
    return this.tenantContext.run(context, fn);
  }

  /** Auto-submitting form page — what mobile opens in the system browser. */
  @Get('pay/:slug/:transactionUuid')
  async payPage(
    @Param('slug') slug: string,
    @Param('transactionUuid') transactionUuid: string,
    @Res() res: Response,
  ): Promise<void> {
    const page = await this.inTenant(slug, () =>
      this.esewaService.buildPayPage(slug, transactionUuid),
    );
    if (page.redirect) {
      res.redirect(page.redirect);
      return;
    }
    // Replace helmet's global CSP for THIS response only — the page needs a
    // nonce'd script and a form POST to eSewa's origin (see buildPayPage).
    res.setHeader('Content-Security-Policy', page.csp!);
    res.type('html').send(page.html);
  }

  @Get('callback/success/:slug/:transactionUuid')
  async callbackSuccess(
    @Param('slug') slug: string,
    @Param('transactionUuid') transactionUuid: string,
    @Query('data') data: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const target = await this.inTenant(slug, () =>
      this.esewaService.handleCallback(slug, transactionUuid, data),
    );
    res.redirect(target);
  }

  /** eSewa's failure redirect carries no payload — identity comes from the path. */
  @Get('callback/failure/:slug/:transactionUuid')
  async callbackFailure(
    @Param('slug') slug: string,
    @Param('transactionUuid') transactionUuid: string,
    @Res() res: Response,
  ): Promise<void> {
    const target = await this.inTenant(slug, () =>
      this.esewaService.handleCallback(slug, transactionUuid),
    );
    res.redirect(target);
  }

  /** PII-free receipt for the web result pages (invoice ref + amount + state). */
  @Get('receipt/:slug/:transactionUuid')
  getReceipt(
    @Param('slug') slug: string,
    @Param('transactionUuid') transactionUuid: string,
  ) {
    return this.inTenant(slug, () => this.esewaService.getReceipt(transactionUuid));
  }
}
