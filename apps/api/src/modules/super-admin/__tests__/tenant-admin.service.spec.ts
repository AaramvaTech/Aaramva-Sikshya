import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TenantAdminService } from '../tenant-admin.service';
import { PublicPrismaService } from '../public-prisma.service';
import { TenantProvisioningService } from '../tenant-provisioning.service';
import { AuditService } from '../audit.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { TenantService } from '../../tenant/tenant.service';
import { PrismaService } from '../../../prisma/prisma.service';

const mockTenant = {
  id: 'tenant-uuid-1',
  name: 'Test School',
  slug: 'testschool',
  logo_url: null,
  address: null,
  phone: null,
  email: 'admin@test.np',
  pan_number: null,
  is_active: true,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('TenantAdminService', () => {
  let service: TenantAdminService;
  let publicPrisma: jest.Mocked<PublicPrismaService>;
  let provisioning: jest.Mocked<TenantProvisioningService>;
  let audit: jest.Mocked<AuditService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TenantAdminService,
        {
          provide: PublicPrismaService,
          useValue: { query: jest.fn(), execute: jest.fn() },
        },
        {
          provide: TenantProvisioningService,
          useValue: { provision: jest.fn() },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
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
          provide: TenantService,
          useValue: {},
        },
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get(TenantAdminService);
    publicPrisma = module.get(PublicPrismaService) as jest.Mocked<PublicPrismaService>;
    provisioning = module.get(TenantProvisioningService) as jest.Mocked<TenantProvisioningService>;
    audit = module.get(AuditService) as jest.Mocked<AuditService>;
  });

  describe('onboardTenant()', () => {
    it('creates tenant + subscription + schema + owner user', async () => {
      (provisioning.provision as jest.Mock).mockResolvedValue({
        tenant: { id: 'tenant-uuid-1', name: 'Test School', slug: 'testschool' },
        user: { id: 'user-uuid-1', email: 'admin@test.np', firstName: 'Ram', lastName: 'B', role: 'SCHOOL_OWNER' },
      });

      const result = await service.onboardTenant(
        {
          schoolName: 'Test School',
          slug: 'testschool',
          adminEmail: 'admin@test.np',
          adminFirstName: 'Ram',
          adminLastName: 'B',
          adminPassword: 'Password123',
          planId: 'plan-uuid-1',
        },
        'admin-uuid-1',
      );

      expect(provisioning.provision).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'testschool', planId: 'plan-uuid-1' }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        'admin-uuid-1',
        'TENANT_CREATED',
        'TENANT',
        'tenant-uuid-1',
        expect.any(Object),
      );
      expect(result.tenant.slug).toBe('testschool');
    });

    it('throws ConflictException if slug is taken', async () => {
      (provisioning.provision as jest.Mock).mockRejectedValue(
        new ConflictException('Slug already taken'),
      );

      await expect(
        service.onboardTenant(
          {
            schoolName: 'Dup School',
            slug: 'testschool',
            adminEmail: 'x@x.np',
            adminFirstName: 'X',
            adminLastName: 'Y',
            adminPassword: 'Password123',
            planId: 'plan-uuid-1',
          },
          'admin-uuid-1',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('suspendTenant()', () => {
    it('sets is_active=false on the tenant', async () => {
      (publicPrisma.query as jest.Mock).mockResolvedValue([
        { id: 'tenant-uuid-1', slug: 'testschool' },
      ]);

      const result = await service.suspendTenant('tenant-uuid-1', 'admin-uuid-1');

      expect(result.isActive).toBe(false);
      expect(publicPrisma.query).toHaveBeenCalledWith(
        expect.stringContaining('is_active = false'),
        'tenant-uuid-1',
      );
      expect(audit.log).toHaveBeenCalledWith(
        'admin-uuid-1', 'TENANT_SUSPENDED', 'TENANT', 'tenant-uuid-1',
      );
    });

    it('throws NotFoundException if tenant not found', async () => {
      (publicPrisma.query as jest.Mock).mockResolvedValue([]);

      await expect(
        service.suspendTenant('no-such-id', 'admin-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('activateTenant()', () => {
    it('sets is_active=true on the tenant', async () => {
      (publicPrisma.query as jest.Mock).mockResolvedValue([
        { id: 'tenant-uuid-1', slug: 'testschool' },
      ]);

      const result = await service.activateTenant('tenant-uuid-1', 'admin-uuid-1');

      expect(result.isActive).toBe(true);
      expect(audit.log).toHaveBeenCalledWith(
        'admin-uuid-1', 'TENANT_ACTIVATED', 'TENANT', 'tenant-uuid-1',
      );
    });
  });
});
