import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../auth.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantService } from '../../tenant/tenant.service';
import { TenantProvisioningService } from '../../super-admin/tenant-provisioning.service';

const mockTenantCtx = {
  tenantId: 'tid-1',
  slug: 'testschool',
  schemaName: 'tenant_testschool',
};

const mockUser = {
  id: 'uid-1',
  email: 'ram@test.edu.np',
  role: 'SCHOOL_OWNER',
  password_hash: '',
  is_active: true,
  first_name: 'Ram',
  last_name: 'Bahadur',
};

describe('AuthService', () => {
  let authService: AuthService;
  let provisioning: jest.Mocked<TenantProvisioningService>;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let tenantContext: jest.Mocked<TenantContextService>;
  let jwt: jest.Mocked<JwtService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: TenantProvisioningService,
          useValue: { provision: jest.fn() },
        },
        {
          provide: TenantPrismaService,
          useValue: {
            query: jest.fn(),
            execute: jest.fn(),
            run: jest.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
              fn({ $queryRawUnsafe: jest.fn(), $executeRawUnsafe: jest.fn() }),
            ),
          },
        },
        {
          provide: TenantContextService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue(mockTenantCtx),
            run: jest.fn().mockImplementation((_ctx, fn) => fn()),
          },
        },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue('mock.jwt.token') },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-secret') },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    authService = module.get(AuthService);
    provisioning = module.get(TenantProvisioningService) as jest.Mocked<TenantProvisioningService>;
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    tenantContext = module.get(TenantContextService) as jest.Mocked<TenantContextService>;
    jwt = module.get(JwtService) as jest.Mocked<JwtService>;
  });

  // ─── register ──────────────────────────────────────────────────────────────

  describe('register()', () => {
    const dto = {
      schoolName: 'Test School',
      slug: 'testschool',
      adminFirstName: 'Ram',
      adminLastName: 'Bahadur',
      adminEmail: 'ram@test.edu.np',
      password: 'Secret123',
    };

    beforeEach(() => {
      (provisioning.provision as jest.Mock).mockResolvedValue({
        tenant: { id: 'tid-1', name: dto.schoolName, slug: dto.slug },
        user: {
          id: 'uid-1',
          email: dto.adminEmail,
          firstName: dto.adminFirstName,
          lastName: dto.adminLastName,
          role: 'SCHOOL_OWNER',
        },
      });
      (tenantPrisma.execute as jest.Mock).mockResolvedValue(1);
    });

    it('delegates to TenantProvisioningService and returns tokens', async () => {
      const result = await authService.register(dto);

      expect(provisioning.provision).toHaveBeenCalledWith(
        expect.objectContaining({ slug: dto.slug, adminEmail: dto.adminEmail }),
      );
      expect(result.school.slug).toBe(dto.slug);
      expect(result.user.email).toBe(dto.adminEmail);
      expect(result.accessToken).toBe('mock.jwt.token');
    });

    it('throws 409 ConflictException if slug is already taken', async () => {
      (provisioning.provision as jest.Mock).mockRejectedValue(
        new ConflictException('Slug already taken'),
      );

      await expect(authService.register(dto)).rejects.toThrow(ConflictException);
    });
  });

  // ─── login ─────────────────────────────────────────────────────────────────

  describe('login()', () => {
    const mockTenant = { name: 'Test School', logo_url: null };

    it('returns tokens with tenant info for valid credentials', async () => {
      const hash = await bcrypt.hash('Secret123', 1);
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ ...mockUser, password_hash: hash }])
        .mockResolvedValueOnce([mockTenant]);
      (tenantPrisma.execute as jest.Mock).mockResolvedValue(1);

      const result = await authService.login({
        email: 'ram@test.edu.np',
        password: 'Secret123',
      });

      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.user.role).toBe('SCHOOL_OWNER');
      expect(result.tenant.name).toBe('Test School');
      expect(result.tenant.slug).toBe('testschool');
      expect(result.tenant.logoUrl).toBeNull();
    });

    // POL-1 T4: the web shell needs the flag on login to force the
    // change-password redirect while a temp password is in effect.
    it('surfaces must_change_password on the login response user', async () => {
      const hash = await bcrypt.hash('Secret123', 1);
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ ...mockUser, password_hash: hash, must_change_password: true }])
        .mockResolvedValueOnce([mockTenant]);
      (tenantPrisma.execute as jest.Mock).mockResolvedValue(1);

      const result = await authService.login({
        email: 'ram@test.edu.np',
        password: 'Secret123',
      });

      expect(result.user.mustChangePassword).toBe(true);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const hash = await bcrypt.hash('Secret123', 1);
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockUser, password_hash: hash },
      ]);

      await expect(
        authService.login({ email: 'ram@test.edu.np', password: 'wrongpassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for unknown email', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      await expect(
        authService.login({ email: 'nobody@test.np', password: 'Secret123' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── refresh ───────────────────────────────────────────────────────────────

  describe('refresh()', () => {
    it('returns new access token for valid refresh token', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        {
          id: 'rt-1',
          user_id: 'uid-1',
          expires_at: new Date(Date.now() + 60_000),
          email: 'ram@test.edu.np',
          role: 'SCHOOL_OWNER',
        },
      ]);
      (tenantPrisma.execute as jest.Mock).mockResolvedValue(1);

      const result = await authService.refresh('some-valid-uuid');

      expect(result.accessToken).toBe('mock.jwt.token');
    });

    it('throws UnauthorizedException for expired refresh token', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        {
          id: 'rt-1',
          user_id: 'uid-1',
          expires_at: new Date(Date.now() - 1000), // already expired
          email: 'ram@test.edu.np',
          role: 'SCHOOL_OWNER',
        },
      ]);

      await expect(authService.refresh('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when no token provided', async () => {
      await expect(authService.refresh(undefined)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── getMe ─────────────────────────────────────────────────────────────────

  describe('getMe()', () => {
    it('returns camelCase user with tenant info', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{
          id: 'uid-1', email: 'ram@test.edu.np',
          first_name: 'Ram', last_name: 'Bahadur',
          role: 'SCHOOL_OWNER', phone: null, avatar_url: null,
        }])
        .mockResolvedValueOnce([{ name: 'Test School', logo_url: null }]);

      const result = await authService.getMe({
        userId: 'uid-1',
        email: 'ram@test.edu.np',
        role: 'SCHOOL_OWNER' as any,
        tenantId: 'tid-1',
        tenantSlug: 'testschool',
      });

      expect(result.firstName).toBe('Ram');
      expect(result.tenant?.name).toBe('Test School');
      expect(result.tenant?.slug).toBe('testschool');
    });

    it('throws UnauthorizedException if user not found', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      await expect(
        authService.getMe({
          userId: 'uid-gone',
          email: 'x@x.com',
          role: 'TEACHER' as any,
          tenantId: 'tid-1',
          tenantSlug: 'testschool',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── Password reset + change (MAIL-1 T3/T4) ─────────────────────────────────

  describe('forgotPassword()', () => {
    it('is oracle-free: resolves void and emits nothing for an unknown email', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]); // no user
      const events = (authService as any).events as { emit: jest.Mock };

      await expect(authService.forgotPassword('nobody@x.com')).resolves.toBeUndefined();

      expect(events.emit).not.toHaveBeenCalled();
      expect(tenantPrisma.execute).not.toHaveBeenCalled(); // no token row created
    });

    it('stores a HASHED token (never the raw token) and emits the reset event', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockUser]);
      (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(1);
      const events = (authService as any).events as { emit: jest.Mock };

      await authService.forgotPassword(mockUser.email);

      const [insertSql, , storedHash] = (tenantPrisma.execute as jest.Mock).mock.calls[0];
      expect(insertSql).toContain('INSERT INTO password_reset_tokens');
      expect(storedHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
      const event = events.emit.mock.calls[0][1] as { resetUrl: string };
      const rawToken = new URL(event.resetUrl).searchParams.get('token')!;
      expect(rawToken).toMatch(/^[0-9a-f]{64}$/); // 32 random bytes hex
      expect(storedHash).not.toBe(rawToken); // hashed at rest
    });
  });

  describe('resetPassword()', () => {
    it('rejects an invalid/expired/used token (atomic claim returns no row)', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]); // claim fails

      await expect(authService.resetPassword('a'.repeat(64), 'NewPass123!'))
        .rejects.toThrow(BadRequestException);
      expect(tenantPrisma.run).not.toHaveBeenCalled(); // nothing changed
    });

    it('claims single-use atomically, updates the hash, and revokes all sessions', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ user_id: 'uid-1' }]);
      const txCalls: string[] = [];
      (tenantPrisma.run as jest.Mock).mockImplementationOnce((fn: (tx: unknown) => unknown) =>
        fn({ $executeRawUnsafe: jest.fn((sql: string) => { txCalls.push(sql); return 1; }) }),
      );

      await expect(authService.resetPassword('b'.repeat(64), 'NewPass123!'))
        .resolves.toEqual({ reset: true });

      const claimSql = (tenantPrisma.query as jest.Mock).mock.calls[0][0] as string;
      expect(claimSql).toContain('used_at IS NULL'); // single-use claim
      expect(claimSql).toContain('expires_at > NOW()'); // expiry enforced
      expect(txCalls.join(' ')).toContain('UPDATE users SET password_hash');
      expect(txCalls.join(' ')).toContain('DELETE FROM refresh_tokens');
      expect(txCalls.join(' ')).toContain('UPDATE password_reset_tokens'); // void other links
    });
  });

  describe('changePassword()', () => {
    it('rejects when the current password does not match', async () => {
      const hash = await bcrypt.hash('RealPassword1', 10);
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ id: 'uid-1', password_hash: hash }]);

      await expect(authService.changePassword('uid-1', 'WrongPassword', 'NewPass123!'))
        .rejects.toThrow(UnauthorizedException);
      expect(tenantPrisma.run).not.toHaveBeenCalled();
    });

    it('changes the password and revokes refresh tokens when current matches', async () => {
      const hash = await bcrypt.hash('RealPassword1', 10);
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ id: 'uid-1', password_hash: hash }]);
      const txCalls: string[] = [];
      (tenantPrisma.run as jest.Mock).mockImplementationOnce((fn: (tx: unknown) => unknown) =>
        fn({ $executeRawUnsafe: jest.fn((sql: string) => { txCalls.push(sql); return 1; }) }),
      );

      await expect(authService.changePassword('uid-1', 'RealPassword1', 'NewPass123!'))
        .resolves.toEqual({ changed: true });
      expect(txCalls.join(' ')).toContain('UPDATE users SET password_hash');
      expect(txCalls.join(' ')).toContain('DELETE FROM refresh_tokens');
      // POL-1 T4: changing the password ends any first-login force.
      expect(txCalls.join(' ')).toContain('must_change_password = false');
    });
  });

  // ─── POL-1 T4: reset-password also clears the first-login force ─────────────

  describe('resetPassword() — must_change_password', () => {
    it('clears the flag when the user resets via an emailed link', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ user_id: 'uid-1' }]); // claim wins
      const txCalls: string[] = [];
      (tenantPrisma.run as jest.Mock).mockImplementationOnce((fn: (tx: unknown) => unknown) =>
        fn({ $executeRawUnsafe: jest.fn((sql: string) => { txCalls.push(sql); return 1; }) }),
      );

      await expect(authService.resetPassword('raw-token', 'NewPass123!'))
        .resolves.toEqual({ reset: true });
      expect(txCalls.join(' ')).toContain('must_change_password = false');
    });
  });
});
