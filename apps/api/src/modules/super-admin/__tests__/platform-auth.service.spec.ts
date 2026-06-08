import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PlatformAuthService } from '../platform-auth.service';
import { PublicPrismaService } from '../public-prisma.service';
import { Role } from '../../common/enums/role.enum';

const mockAdmin = {
  id: 'admin-uuid-1',
  email: 'admin@aaramvashikshya.com',
  password_hash: '',
  is_active: true,
};

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
  });
});
