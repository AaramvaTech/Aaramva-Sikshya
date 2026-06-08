import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';
import { TenantContextService } from './tenant-context.service';
import { TenantService } from './tenant.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  /**
   * Public routes that must work WITHOUT an existing tenant. Matched as a
   * suffix of req.path so they hold regardless of the global API prefix.
   */
  private static readonly PUBLIC_PATH_SUFFIXES = [
    '/auth/register-school',
    '/super-admin/',        // all platform-admin routes need no tenant context
  ];

  constructor(
    private readonly tenantService: TenantService,
    private readonly tenantContext: TenantContextService,
    private readonly config: ConfigService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const fullPath = req.originalUrl.split('?')[0];
    if (
      TenantMiddleware.PUBLIC_PATH_SUFFIXES.some((suffix) =>
        fullPath.includes(suffix),
      )
    ) {
      return next();
    }

    const slug = this.extractSlug(req);

    if (!slug) {
      throw new NotFoundException(
        'No tenant specified. Provide a subdomain (school.domain) or an X-Tenant-Slug header.',
      );
    }

    const context = await this.tenantService.resolveBySlug(slug);

    // Attach to req for convenience, and bind it for the whole async request.
    (req as Request & { tenant?: typeof context }).tenant = context;
    this.tenantContext.run(context, () => next());
  }

  /**
   * Determine the tenant slug for this request.
   * Priority: X-Tenant-Slug header (dev/testing) → subdomain of APP_DOMAIN →
   * subdomain of localhost.
   */
  private extractSlug(req: Request): string | undefined {
    const header = req.header('x-tenant-slug');
    if (header && header.trim()) {
      return header.trim().toLowerCase();
    }

    const host = (req.hostname || '').toLowerCase();
    const appDomain = (this.config.get<string>('APP_DOMAIN') || 'localhost').toLowerCase();

    const fromSuffix = (suffix: string): string | undefined => {
      if (host.endsWith('.' + suffix)) {
        const first = host.slice(0, host.length - suffix.length - 1).split('.')[0];
        if (first && first !== 'www') return first;
      }
      return undefined;
    };

    // Production: <slug>.aaramvashikshya.com
    const prodSlug = fromSuffix(appDomain);
    if (prodSlug) return prodSlug;

    // Local dev: <slug>.localhost
    if (appDomain !== 'localhost') {
      const devSlug = fromSuffix('localhost');
      if (devSlug) return devSlug;
    }

    return undefined;
  }
}
