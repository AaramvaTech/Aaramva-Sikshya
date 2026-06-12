import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../auth.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantProvisioningService } from '../../super-admin/tenant-provisioning.service';

const mockTenantCtx = { tenantId: 'tid-1', slug: 'testschool', schemaName: 'tenant_testschool' };

const mockUser = {
  id: 'uid-1',
  email: 'ram@test.edu.np',
  role: 'SCHOOL_OWNER',
  password_hash: '',
  is_active: true,
};

const mockTenant = { name: 'Test School', logo_url: null };

describe('AuthService — mobile client behaviour', () => {
  let authService: AuthService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: TenantProvisioningService, useValue: { provision: jest.fn() } },
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
        {
          provide: TenantContextService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue(mockTenantCtx),
            run: jest.fn().mockImplementation((_ctx: unknown, fn: () => unknown) => fn()),
          },
        },
        { provide: JwtService, useValue: { signAsync: jest.fn().mockResolvedValue('mock.jwt.token') } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test-secret') } },
      ],
    }).compile();

    authService = module.get(AuthService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
  });

  // Test 1: login returns refresh token in response (service layer always returns it)
  it('login() always returns refreshToken in result (controller decides delivery)', async () => {
    const hash = await bcrypt.hash('Secret123', 1);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ ...mockUser, password_hash: hash }])
      .mockResolvedValueOnce([mockTenant]);
    (tenantPrisma.execute as jest.Mock).mockResolvedValue(1);

    const result = await authService.login({ email: 'ram@test.edu.np', password: 'Secret123' });

    expect(result.refreshToken).toBeTruthy();
    expect(result.accessToken).toBe('mock.jwt.token');
  });

  // Test 2: refresh() always returns refreshToken in result (rotation)
  it('refresh() always returns new refreshToken (rotation — controller decides delivery)', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
      id: 'rt-1',
      user_id: 'uid-1',
      expires_at: new Date(Date.now() + 60_000),
      email: 'ram@test.edu.np',
      role: 'SCHOOL_OWNER',
    }]);
    (tenantPrisma.execute as jest.Mock).mockResolvedValue(1);

    const result = await authService.refresh('some-valid-uuid');

    expect(result.refreshToken).toBeTruthy();
    expect(result.accessToken).toBe('mock.jwt.token');
  });

  // Test 3: refresh() with undefined token → 401 (missing body token on mobile = hard 401)
  it('refresh() throws 401 when token is undefined (no fallback)', async () => {
    await expect(authService.refresh(undefined)).rejects.toThrow(UnauthorizedException);
  });

  // Test 4: refresh() with expired token → 401
  it('refresh() throws 401 for expired token', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
      id: 'rt-1',
      user_id: 'uid-1',
      expires_at: new Date(Date.now() - 1000),
      email: 'ram@test.edu.np',
      role: 'SCHOOL_OWNER',
    }]);

    await expect(authService.refresh('expired-token')).rejects.toThrow(UnauthorizedException);
  });

  // Test 5: logout() revokes token (web behaviour unchanged)
  it('logout() revokes the refresh token', async () => {
    (tenantPrisma.execute as jest.Mock).mockResolvedValue(1);

    await authService.logout('some-refresh-token');

    expect(tenantPrisma.execute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM refresh_tokens'),
      expect.any(String),
    );
  });

  // Test 6: logout() with expoPushToken deletes device token row
  it('logout() with expoPushToken deletes the matching device token for the user', async () => {
    (tenantPrisma.execute as jest.Mock).mockResolvedValue(1);

    await authService.logout('some-refresh-token', {
      expoPushToken: 'ExponentPushToken[abc123]',
      userId: 'uid-1',
    });

    expect(tenantPrisma.execute).toHaveBeenCalledTimes(2);
    const secondCall = (tenantPrisma.execute as jest.Mock).mock.calls[1];
    expect(secondCall[0]).toContain('DELETE FROM device_tokens');
    expect(secondCall[1]).toBe('ExponentPushToken[abc123]');
    expect(secondCall[2]).toBe('uid-1');
  });
});
