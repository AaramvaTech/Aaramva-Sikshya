import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import type { AuthUser } from '../../auth/auth.types';
import { ALLOW_PASSWORD_CHANGE_REQUIRED } from '../decorators/allow-password-change-required.decorator';

/**
 * REG-1 §3 — forced-change gate.
 *
 * A tenant user whose `users.must_change_password` is true may authenticate and
 * call ONLY the routes marked `@AllowPasswordChangeRequired()` (change-password,
 * logout); every other authenticated endpoint returns 403 with error code
 * `PASSWORD_CHANGE_REQUIRED`.
 *
 * Registered as a global APP_GUARD AFTER OptionalJwtGuard (which populates
 * req.user) and TenantMatchGuard (token tenant == resolved tenant). Enforcement
 * is server-side and identical for web and mobile clients — `X-Client-Type` is
 * irrelevant.
 *
 * The flag is read FRESH from the DB (not baked into the token) so a successful
 * change-password unblocks the SAME access token immediately: no re-login, no
 * stale-token window.
 */
@Injectable()
export class PasswordChangeRequiredGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();

    const user = req.user;
    if (!user) return true; // unauthenticated (public / login / refresh) — nothing to gate

    // change-password / logout stay reachable while the flag is set.
    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PASSWORD_CHANGE_REQUIRED,
      [context.getHandler(), context.getClass()],
    );
    if (allowed) return true;

    // Platform admins (tenantId null) have no tenant users row to check and are
    // not REG-1-provisioned (REG-OBS-2 — platform-side forced-change out of scope).
    if (user.tenantId == null) return true;

    const rows = await this.tenantPrisma.query<{ must_change_password: boolean }>(
      `SELECT must_change_password FROM users WHERE id = $1::uuid AND deleted_at IS NULL`,
      user.userId,
    );
    if (rows[0]?.must_change_password) {
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'You must change your temporary password before continuing.',
      });
    }
    return true;
  }
}
