import { UnauthorizedException } from '@nestjs/common';
import { OptionalJwtGuard } from '../optional-jwt.guard';
import { JwtAuthGuard } from '../jwt-auth.guard';

const ctxFor = (req: unknown) =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as any;

/**
 * QA-1 BUG-4 regression — the global lenient OptionalJwtGuard must NOT weaken
 * existing authentication.
 *
 * OptionalJwtGuard exists only to POPULATE req.user from a valid access token so
 * the global TenantMatchGuard can run; it never authenticates on its own and must
 * never reject. Strict auth stays per-controller (JwtAuthGuard). This suite proves
 * that an unauthenticated request to a protected tenant endpoint still returns 401
 * AFTER the lenient guard has run — i.e. adding OptionalJwtGuard did not turn any
 * previously-protected route into an open one.
 */
describe('OptionalJwtGuard (QA-1 BUG-4) — does not weaken existing auth', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is lenient: missing/invalid token → returns no user and never throws', () => {
    const guard = new OptionalJwtGuard();
    expect(() => guard.handleRequest(null, false)).not.toThrow();
    expect(guard.handleRequest(null, false)).toBeUndefined();
  });

  it('still populates req.user when a valid token IS present', () => {
    const guard = new OptionalJwtGuard();
    const user = { userId: 'u1', role: 'SCHOOL_OWNER', tenantId: 't1' };
    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it('canActivate always lets the request continue (true) and sets no user when the token layer fails', async () => {
    const guard = new OptionalJwtGuard();
    // Simulate a missing/invalid token: the underlying passport activation rejects.
    const passportProto = Object.getPrototypeOf(OptionalJwtGuard.prototype);
    jest
      .spyOn(passportProto, 'canActivate')
      .mockRejectedValue(new UnauthorizedException());

    const req: { user?: unknown } = {};
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    // The lenient guard authenticated nobody — the request stays anonymous.
    expect(req.user).toBeUndefined();
  });

  it('REGRESSION: a protected endpoint (JwtAuthGuard) still returns 401 for an unauthenticated request', () => {
    const strict = new JwtAuthGuard();
    // With no valid token the passport strategy yields user=false; the strict
    // per-controller guard must still reject with 401 (UnauthorizedException).
    expect(() => strict.handleRequest(null, false, null)).toThrow(
      UnauthorizedException,
    );
  });
});
