import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../auth.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantService } from '../../tenant/tenant.service';
import { PrismaService } from '../../../prisma/prisma.service';

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
  let prisma: jest.Mocked<PrismaService>;
  let tenantService: jest.Mocked<TenantService>;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let tenantContext: jest.Mocked<TenantContextService>;
  let jwt: jest.Mocked<JwtService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            tenant: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
            plan: { findFirst: jest.fn() },
            subscription: { deleteMany: jest.fn() },
            $executeRawUnsafe: jest.fn(),
          },
        },
        {
          provide: TenantService,
          useValue: {
            provisionSchema: jest.fn(),
          },
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
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
    tenantService = module.get(TenantService) as jest.Mocked<TenantService>;
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
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.plan.findFirst as jest.Mock).mockResolvedValue({
        id: 'plan-1',
        name: 'Basic',
      });
      (prisma.tenant.create as jest.Mock).mockResolvedValue({
        id: 'tid-1',
        name: dto.schoolName,
        slug: dto.slug,
      });
      (tenantService.provisionSchema as jest.Mock).mockResolvedValue(undefined);
      (tenantPrisma.query as jest.Mock).mockResolvedValue([
        {
          id: 'uid-1',
          email: dto.adminEmail,
          first_name: dto.adminFirstName,
          last_name: dto.adminLastName,
          role: 'SCHOOL_OWNER',
        },
      ]);
      (tenantPrisma.execute as jest.Mock).mockResolvedValue(1);
    });

    it('creates tenant schema and first user on success', async () => {
      const result = await authService.register(dto);

      expect(tenantService.provisionSchema).toHaveBeenCalledWith(dto.slug);
      expect(tenantPrisma.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        dto.adminEmail,
        expect.any(String), // hashed password
        dto.adminFirstName,
        dto.adminLastName,
        'SCHOOL_OWNER',
      );
      expect(result.school.slug).toBe(dto.slug);
      expect(result.user.email).toBe(dto.adminEmail);
      expect(result.accessToken).toBe('mock.jwt.token');
    });

    it('throws 409 ConflictException if slug is already taken', async () => {
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 'existing' });

      await expect(authService.register(dto)).rejects.toThrow(ConflictException);
    });
  });

  // ─── login ─────────────────────────────────────────────────────────────────

  describe('login()', () => {
    it('returns tokens for valid credentials', async () => {
      const hash = await bcrypt.hash('Secret123', 1);
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockUser, password_hash: hash },
      ]);
      (tenantPrisma.execute as jest.Mock).mockResolvedValue(1);

      const result = await authService.login({
        email: 'ram@test.edu.np',
        password: 'Secret123',
      });

      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.user.role).toBe('SCHOOL_OWNER');
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
});
