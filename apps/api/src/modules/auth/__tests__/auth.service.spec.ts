import { ConflictException, UnauthorizedException } from '@nestjs/common';
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
});
