import { ForbiddenException } from '@nestjs/common';
import { PasswordChangeRequiredGuard } from '../password-change-required.guard';

const ctxFor = (req: unknown) =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  }) as any;

describe('PasswordChangeRequiredGuard (REG-1 §3)', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const tenantPrisma = { query: jest.fn() };
  let guard: PasswordChangeRequiredGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue(false);
    guard = new PasswordChangeRequiredGuard(
      reflector as any,
      tenantPrisma as any,
    );
  });

  it('allows unauthenticated requests (no req.user) without a DB check', async () => {
    expect(await guard.canActivate(ctxFor({}))).toBe(true);
    expect(tenantPrisma.query).not.toHaveBeenCalled();
  });

  it('allows @AllowPasswordChangeRequired routes (change-password/logout) even when flagged', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const ctx = ctxFor({ user: { userId: 'u1', tenantId: 't1' } });
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(tenantPrisma.query).not.toHaveBeenCalled();
  });

  it('allows platform admins (tenantId null) without a DB check', async () => {
    const ctx = ctxFor({ user: { userId: 'pa', tenantId: null } });
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(tenantPrisma.query).not.toHaveBeenCalled();
  });

  it('BLOCKS a tenant user whose must_change_password is true → 403 PASSWORD_CHANGE_REQUIRED', async () => {
    tenantPrisma.query.mockResolvedValue([{ must_change_password: true }]);
    const ctx = ctxFor({ user: { userId: 'u1', tenantId: 't1' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    try {
      await guard.canActivate(ctx);
      fail('expected ForbiddenException');
    } catch (e) {
      expect((e as ForbiddenException).getResponse()).toMatchObject({
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }
  });

  it('allows a tenant user whose flag is false (fresh DB read — e.g. just changed)', async () => {
    tenantPrisma.query.mockResolvedValue([{ must_change_password: false }]);
    const ctx = ctxFor({ user: { userId: 'u1', tenantId: 't1' } });
    expect(await guard.canActivate(ctx)).toBe(true);
  });
});
