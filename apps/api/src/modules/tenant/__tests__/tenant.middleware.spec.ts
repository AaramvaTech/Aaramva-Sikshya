import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TenantMiddleware } from '../tenant.middleware';
import { TenantService } from '../tenant.service';
import { TenantContextService } from '../tenant-context.service';

const mockContext = {
  tenantId: 'tid-1',
  slug: 'sxs',
  schemaName: 'tenant_sxs',
};

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    hostname: 'localhost',
    originalUrl: '/api/v1/some-route',
    path: '/api/v1/some-route',
    header: jest.fn().mockReturnValue(null),
    ...overrides,
  };
}

describe('TenantMiddleware', () => {
  let middleware: TenantMiddleware;
  let tenantService: jest.Mocked<TenantService>;
  let tenantContext: jest.Mocked<TenantContextService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TenantMiddleware,
        {
          provide: TenantService,
          useValue: { resolveBySlug: jest.fn().mockResolvedValue(mockContext) },
        },
        {
          provide: TenantContextService,
          useValue: { run: jest.fn().mockImplementation((_ctx, fn) => fn()) },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('aaramvashikshya.com') },
        },
      ],
    }).compile();

    middleware = module.get(TenantMiddleware);
    tenantService = module.get(TenantService) as jest.Mocked<TenantService>;
    tenantContext = module.get(TenantContextService) as jest.Mocked<TenantContextService>;
  });

  it('resolves tenant from X-Tenant-Slug header', async () => {
    const req = makeReq({
      header: jest.fn().mockReturnValue('sxs'),
    });
    const next = jest.fn();

    await middleware.use(req as never, {} as never, next);

    expect(tenantService.resolveBySlug).toHaveBeenCalledWith('sxs');
    expect(tenantContext.run).toHaveBeenCalledWith(mockContext, expect.any(Function));
    expect(next).toHaveBeenCalled();
  });

  it('resolves tenant from subdomain of APP_DOMAIN', async () => {
    const req = makeReq({
      hostname: 'sxs.aaramvashikshya.com',
      header: jest.fn().mockReturnValue(null),
    });
    const next = jest.fn();

    await middleware.use(req as never, {} as never, next);

    expect(tenantService.resolveBySlug).toHaveBeenCalledWith('sxs');
  });

  it('resolves tenant from subdomain of localhost in dev', async () => {
    const req = makeReq({
      hostname: 'sxs.localhost',
      header: jest.fn().mockReturnValue(null),
    });
    const next = jest.fn();

    await middleware.use(req as never, {} as never, next);

    expect(tenantService.resolveBySlug).toHaveBeenCalledWith('sxs');
  });

  it('throws NotFoundException for unknown subdomain', async () => {
    (tenantService.resolveBySlug as jest.Mock).mockRejectedValue(
      new NotFoundException('School "unknown" not found'),
    );
    const req = makeReq({ header: jest.fn().mockReturnValue('unknown') });

    await expect(middleware.use(req as never, {} as never, jest.fn())).rejects.toThrow(
      NotFoundException,
    );
  });

  it('skips tenant resolution for register-school route', async () => {
    const req = makeReq({
      originalUrl: '/api/v1/auth/register-school',
      header: jest.fn().mockReturnValue(null),
    });
    const next = jest.fn();

    await middleware.use(req as never, {} as never, next);

    expect(tenantService.resolveBySlug).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('throws NotFoundException when no slug found and route is not public', async () => {
    const req = makeReq({ header: jest.fn().mockReturnValue(null) });

    await expect(middleware.use(req as never, {} as never, jest.fn())).rejects.toThrow(
      NotFoundException,
    );
  });
});
