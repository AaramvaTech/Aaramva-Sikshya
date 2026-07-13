import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../../auth/auth.types';

interface ResolvedTenant {
  tenantId: string;
  slug: string;
  schemaName: string;
}

/**
 * QA-1 BUG-4 fix — closes a critical multi-tenancy isolation hole.
 *
 * TenantMiddleware picks the DB schema purely from the X-Tenant-Slug header (or
 * subdomain) and runs BEFORE authentication, so nothing ever checked that the
 * authenticated token actually belongs to the resolved tenant. A valid token
 * from tenant A + `X-Tenant-Slug: B` therefore operated on tenant B's data.
 *
 * This guard (registered as a global APP_GUARD, right after the lenient
 * OptionalJwtGuard that populates req.user) enforces: the token's canonical
 * tenantId MUST equal the resolved tenant context's tenantId — compared by id,
 * never by slug.
 *
 * Deliberate no-ops (return true):
 *  - no req.user  → public / login / refresh routes (no authenticated actor).
 *  - no req.tenant → routes excluded from TenantMiddleware (super-admin,
 *    tenants/verify, gateway public callbacks, /health) have no tenant context.
 *
 * Platform admins carry tenantId = null (not bound to any tenant); they are
 * allowed through but every such cross-tenant access is audit-logged. Normal
 * and impersonation tokens carry a concrete tenantId and are enforced.
 */
@Injectable()
export class TenantMatchGuard implements CanActivate {
  private readonly logger = new Logger(TenantMatchGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<
      Request & { user?: AuthUser; tenant?: ResolvedTenant }
    >();

    const user = req.user;
    if (!user) return true; // unauthenticated (public/login/refresh) — nothing to match

    const resolved = req.tenant;
    if (!resolved) return true; // no tenant context (super-admin / verify / gateway-public / health)

    // Platform admin (not tenant-bound): allow, but audit every cross-tenant hit.
    if (user.tenantId == null) {
      this.logger.log(
        JSON.stringify({
          event: 'platform_admin_tenant_access',
          actorUserId: user.userId,
          actorRole: user.role,
          resolvedTenantId: resolved.tenantId,
          resolvedTenantSlug: resolved.slug,
          path: req.originalUrl,
          method: req.method,
        }),
      );
      return true;
    }

    // The core check — canonical ids, never slugs.
    if (user.tenantId !== resolved.tenantId) {
      this.logger.warn(
        JSON.stringify({
          event: 'cross_tenant_token_blocked',
          actorUserId: user.userId,
          actorRole: user.role,
          tokenTenantId: user.tenantId,
          resolvedTenantId: resolved.tenantId,
          resolvedTenantSlug: resolved.slug,
          path: req.originalUrl,
          method: req.method,
        }),
      );
      throw new ForbiddenException('Token tenant does not match the requested tenant.');
    }

    return true;
  }
}
