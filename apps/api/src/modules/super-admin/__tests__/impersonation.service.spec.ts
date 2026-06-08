import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ImpersonationService } from '../impersonation.service';
import { PublicPrismaService } from '../public-prisma.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { AuditService } from '../audit.service';
import { Role } from '../../common/enums/role.enum';

describe('ImpersonationService', () => {
  let service: ImpersonationService;
  let publicPrisma: jest.Mocked<PublicPrismaService>;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let tenantContext: jest.Mocked<TenantContextService>;
  let jwt: jest.Mocked<JwtService>;
  let audit: jest.Mocked<AuditService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ImpersonationService,
        {
          provide: PublicPrismaService,
          useValue: { query: jest.fn() },
        },
        {
          provide: TenantPrismaService,
          useValue: { query: jest.fn() },
        },
        {
          provide: TenantContextService,
          useValue: { run: jest.fn().mockImplementation((_ctx, fn) => fn()) },
        },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue('impersonation.jwt') },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-secret') },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(ImpersonationService);
    publicPrisma = module.get(PublicPrismaService) as jest.Mocked<PublicPrismaService>;
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    tenantContext = module.get(TenantContextService) as jest.Mocked<TenantContextService>;
    jwt = module.get(JwtService) as jest.Mocked<JwtService>;
    audit = module.get(AuditService) as jest.Mocked<AuditService>;
  });

  describe('impersonate()', () => {
    it('returns 1-hour JWT with SCHOOL_OWNER role', async () => {
      (publicPrisma.query as jest.Mock).mockResolvedValue([
        { id: 'tenant-uuid-1', slug: 'testschool', name: 'Test School', is_active: true },
      ]);
      (tenantPrisma.query as jest.Mock).mockResolvedValue([
        { id: 'user-uuid-1', email: 'owner@test.np', role: Role.SCHOOL_OWNER },
      ]);

      const result = await service.impersonate('tenant-uuid-1', 'admin-uuid-1', 'admin@a.com');

      expect(result.accessToken).toBe('impersonation.jwt');
      expect(result.tenantSlug).toBe('testschool');
      expect(result.warning).toContain('SCHOOL_OWNER');
      expect(jwt.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ role: Role.SCHOOL_OWNER, tenantId: 'tenant-uuid-1' }),
        expect.objectContaining({ expiresIn: '1h' }),
      );
    });

    it('logs action to platform_audit_logs', async () => {
      (publicPrisma.query as jest.Mock).mockResolvedValue([
        { id: 'tenant-uuid-1', slug: 'testschool', name: 'Test School', is_active: true },
      ]);
      (tenantPrisma.query as jest.Mock).mockResolvedValue([
        { id: 'user-uuid-1', email: 'owner@test.np', role: Role.SCHOOL_OWNER },
      ]);

      await service.impersonate('tenant-uuid-1', 'admin-uuid-1', 'admin@a.com');

      expect(audit.log).toHaveBeenCalledWith(
        'admin-uuid-1',
        'IMPERSONATION',
        'TENANT',
        'tenant-uuid-1',
        expect.objectContaining({ adminId: 'admin-uuid-1' }),
      );
    });

    it('throws NotFoundException if tenant not found', async () => {
      (publicPrisma.query as jest.Mock).mockResolvedValue([]);

      await expect(
        service.impersonate('no-such-id', 'admin-uuid-1', 'admin@a.com'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
