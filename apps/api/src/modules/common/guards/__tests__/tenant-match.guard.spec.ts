import { ForbiddenException, Logger } from '@nestjs/common';
import { TenantMatchGuard } from '../tenant-match.guard';

const ctxFor = (req: unknown) =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as any;

const TENANT_A = { tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', slug: 'a', schemaName: 'tenant_a' };
const TENANT_B = { tenantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', slug: 'b', schemaName: 'tenant_b' };

describe('TenantMatchGuard (QA-1 BUG-4)', () => {
  let guard: TenantMatchGuard;

  beforeEach(() => {
    guard = new TenantMatchGuard();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('BLOCKS a token whose tenantId ≠ the resolved tenant (cross-tenant)', () => {
    const req = { user: { userId: 'u1', role: 'SCHOOL_OWNER', tenantId: TENANT_A.tenantId }, tenant: TENANT_B, method: 'GET', originalUrl: '/x' };
    expect(() => guard.canActivate(ctxFor(req))).toThrow(ForbiddenException);
    expect(Logger.prototype.warn).toHaveBeenCalled();
  });

  it('ALLOWS a token whose tenantId === the resolved tenant', () => {
    const req = { user: { userId: 'u1', role: 'SCHOOL_OWNER', tenantId: TENANT_A.tenantId }, tenant: TENANT_A };
    expect(guard.canActivate(ctxFor(req))).toBe(true);
  });

  it('ALLOWS a platform-admin token (tenantId null) but audit-logs the access', () => {
    const req = { user: { userId: 'pa', role: 'PLATFORM_ADMIN', tenantId: null }, tenant: TENANT_B, method: 'GET', originalUrl: '/y' };
    expect(guard.canActivate(ctxFor(req))).toBe(true);
    expect(Logger.prototype.log).toHaveBeenCalled();
  });

  it('no-ops when there is no authenticated user (public/login/refresh)', () => {
    expect(guard.canActivate(ctxFor({ tenant: TENANT_A }))).toBe(true);
  });

  it('no-ops when there is no resolved tenant (super-admin / verify / gateway-public / health)', () => {
    const req = { user: { userId: 'u1', role: 'SCHOOL_OWNER', tenantId: TENANT_A.tenantId } };
    expect(guard.canActivate(ctxFor(req))).toBe(true);
  });
});
