import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * QA-1 BUG-4 support: a GLOBAL, lenient JWT guard whose only job is to populate
 * `req.user` from a valid access token when one is present — it NEVER rejects.
 *
 * Why it exists: strict authentication stays per-controller (`JwtAuthGuard` in
 * each `@UseGuards`). But the global `TenantMatchGuard` (registered right after
 * this one) needs `req.user` to compare the token's tenant against the request's
 * resolved tenant, and global guards run BEFORE controller guards. This guard
 * fills that gap without forcing every public route to carry an `@Public()`
 * marker: public/login/refresh requests simply have no token → no `req.user` →
 * the TenantMatchGuard no-ops on them.
 */
@Injectable()
export class OptionalJwtGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      // Runs passport; on success sets req.user via handleRequest below.
      await super.canActivate(context);
    } catch {
      // Optional: a missing/invalid token must never block here — strict auth
      // is enforced by the per-controller JwtAuthGuard.
    }
    return true;
  }

  // Return the user when present; NEVER throw (the base class throws by default).
  handleRequest<TUser = unknown>(_err: unknown, user: TUser): TUser {
    return (user || undefined) as TUser;
  }
}
