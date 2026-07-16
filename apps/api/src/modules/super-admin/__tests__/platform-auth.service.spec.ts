import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { PlatformAuthService } from '../platform-auth.service';
import { PublicPrismaService } from '../public-prisma.service';
import { Role } from '../../common/enums/role.enum';

const mockAdmin = {
  id: 'admin-uuid-1',
  email: 'admin@aaramvashikshya.com',
  password_hash: '',
  is_active: true,
  first_name: 'Root',
  last_name: 'Admin',
};

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** Find the raw-SQL call whose statement contains `fragment`. */
function sqlCall(execute: jest.Mock, fragment: string) {
  return execute.mock.calls.find((c) => String(c[0]).includes(fragment));
}

describe('PlatformAuthService', () => {
  let service: PlatformAuthService;
  let publicPrisma: jest.Mocked<PublicPrismaService>;
  let jwt: jest.Mocked<JwtService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PlatformAuthService,
        {
          provide: PublicPrismaService,
          useValue: {
            query: jest.fn(),
            execute: jest.fn().mockResolvedValue(1),
          },
        },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue('mock.platform.jwt') },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-secret') },
        },
      ],
    }).compile();

    service = module.get(PlatformAuthService);
    publicPrisma = module.get(PublicPrismaService) as jest.Mocked<PublicPrismaService>;
    jwt = module.get(JwtService) as jest.Mocked<JwtService>;
  });

  describe('login()', () => {
    it('returns JWT with PLATFORM_ADMIN role and tenantId null', async () => {
      const hash = await bcrypt.hash('Admin@1234', 1);
      (publicPrisma.query as jest.Mock).mockResolvedValue([
        { ...mockAdmin, password_hash: hash },
      ]);

      const result = await service.login({
        email: 'admin@aaramvashikshya.com',
        password: 'Admin@1234',
      });

      expect(result.accessToken).toBe('mock.platform.jwt');
      expect(result.admin.role).toBe(Role.PLATFORM_ADMIN);
      expect(jwt.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: null, role: Role.PLATFORM_ADMIN }),
        expect.any(Object),
      );
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const hash = await bcrypt.hash('Admin@1234', 1);
      (publicPrisma.query as jest.Mock).mockResolvedValue([
        { ...mockAdmin, password_hash: hash },
      ]);

      await expect(
        service.login({ email: 'admin@aaramvashikshya.com', password: 'wrongpass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for unknown email', async () => {
      (publicPrisma.query as jest.Mock).mockResolvedValue([]);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'Admin@1234' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('issues a refresh token, storing ONLY its sha256 hash', async () => {
      const hash = await bcrypt.hash('Admin@1234', 1);
      (publicPrisma.query as jest.Mock).mockResolvedValue([
        { ...mockAdmin, password_hash: hash },
      ]);

      const result = await service.login({ email: mockAdmin.email, password: 'Admin@1234' });

      expect(result.refreshToken).toMatch(/^[0-9a-f-]{36}$/i); // raw uuid → client only
      expect(result.refreshExpiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(result.admin.firstName).toBe('Root');

      const insert = sqlCall(publicPrisma.execute as jest.Mock, 'INSERT INTO platform_refresh_tokens');
      expect(insert).toBeDefined();
      expect(insert![2]).toBe(sha256(result.refreshToken));
      expect(insert![2]).not.toBe(result.refreshToken); // the raw token is never persisted
    });
  });

  describe('refresh()', () => {
    const validRow = {
      id: 'rt-1',
      admin_id: mockAdmin.id,
      expires_at: new Date(Date.now() + 60_000),
      email: mockAdmin.email,
      is_active: true,
      first_name: 'Root',
      last_name: 'Admin',
    };

    it('rotates: burns the presented token and issues a fresh pair', async () => {
      (publicPrisma.query as jest.Mock).mockResolvedValue([validRow]);

      const result = await service.refresh('raw-token');

      expect(result.accessToken).toBe('mock.platform.jwt');
      expect(result.admin.role).toBe(Role.PLATFORM_ADMIN);
      expect(result.admin.firstName).toBe('Root');
      expect(result.refreshToken).not.toBe('raw-token'); // new token issued
      expect(sqlCall(publicPrisma.execute as jest.Mock, 'DELETE FROM platform_refresh_tokens WHERE id')).toBeDefined();
      expect(sqlCall(publicPrisma.execute as jest.Mock, 'INSERT INTO platform_refresh_tokens')).toBeDefined();
    });

    it('looks the token up by hash, never by raw value', async () => {
      (publicPrisma.query as jest.Mock).mockResolvedValue([validRow]);
      await service.refresh('raw-token');
      expect(publicPrisma.query).toHaveBeenCalledWith(expect.any(String), sha256('raw-token'));
    });

    it('throws when no token is presented', async () => {
      await expect(service.refresh(undefined)).rejects.toThrow(UnauthorizedException);
    });

    it('throws for an unknown token', async () => {
      (publicPrisma.query as jest.Mock).mockResolvedValue([]);
      await expect(service.refresh('nope')).rejects.toThrow(UnauthorizedException);
    });

    it('throws for an expired token', async () => {
      (publicPrisma.query as jest.Mock).mockResolvedValue([
        { ...validRow, expires_at: new Date(Date.now() - 1000) },
      ]);
      await expect(service.refresh('stale')).rejects.toThrow(UnauthorizedException);
    });

    it('revokes every session when the admin was disabled mid-session', async () => {
      (publicPrisma.query as jest.Mock).mockResolvedValue([{ ...validRow, is_active: false }]);

      await expect(service.refresh('raw-token')).rejects.toThrow(UnauthorizedException);
      expect(
        sqlCall(publicPrisma.execute as jest.Mock, 'DELETE FROM platform_refresh_tokens WHERE admin_id'),
      ).toBeDefined();
    });
  });

  describe('logout()', () => {
    it('revokes the presented session by hash', async () => {
      await service.logout('raw-token');
      const del = sqlCall(publicPrisma.execute as jest.Mock, 'DELETE FROM platform_refresh_tokens WHERE token_hash');
      expect(del).toBeDefined();
      expect(del![1]).toBe(sha256('raw-token'));
    });

    it('is a no-op when no token is presented', async () => {
      await service.logout(undefined);
      expect(publicPrisma.execute).not.toHaveBeenCalled();
    });
  });

  describe('changePassword()', () => {
    it('revokes EVERY session for the admin (they must re-login everywhere)', async () => {
      const hash = await bcrypt.hash('Old@12345', 1);
      (publicPrisma.query as jest.Mock).mockResolvedValue([
        { ...mockAdmin, password_hash: hash },
      ]);

      await expect(service.changePassword(mockAdmin.id, 'Old@12345', 'New@12345')).resolves.toEqual({
        changed: true,
      });
      expect(
        sqlCall(publicPrisma.execute as jest.Mock, 'DELETE FROM platform_refresh_tokens WHERE admin_id'),
      ).toBeDefined();
    });

    it('rejects a wrong current password (and revokes nothing)', async () => {
      const hash = await bcrypt.hash('Old@12345', 1);
      (publicPrisma.query as jest.Mock).mockResolvedValue([
        { ...mockAdmin, password_hash: hash },
      ]);

      await expect(service.changePassword(mockAdmin.id, 'wrong', 'New@12345')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(publicPrisma.execute).not.toHaveBeenCalled();
    });
  });
});
