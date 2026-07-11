import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { TenantAdminService } from '../tenant-admin.service';
import { PublicPrismaService } from '../public-prisma.service';
import { TenantProvisioningService } from '../tenant-provisioning.service';
import { AuditService } from '../audit.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { TenantService } from '../../tenant/tenant.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BrandingColorService } from '../../branding/branding-color.service';

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
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
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
        {
          provide: BrandingColorService,
          useValue: { deriveThemeFromLogo: jest.fn().mockResolvedValue(null) },
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

  describe('listTenants()', () => {
    it('returns real per-tenant student/staff counts from the tenant schema', async () => {
      const tenantPrisma = (service as any).tenantPrisma as jest.Mocked<TenantPrismaService>;

      (publicPrisma.query as jest.Mock)
        // count query
        .mockResolvedValueOnce([{ count: '1' }])
        // rows query
        .mockResolvedValueOnce([
          {
            id: 'tenant-uuid-1',
            name: 'Test School',
            slug: 'testschool',
            is_active: true,
            created_at: new Date(),
            sub_status: 'ACTIVE',
            plan_name: 'Basic',
            plan_id: 'plan-uuid-1',
          },
        ]);
      (tenantPrisma.query as jest.Mock).mockResolvedValue([
        { students: '42', staff: '7' },
      ]);

      const result = await service.listTenants({ page: 1, limit: 20 });

      expect(result.data[0].studentCount).toBe(42);
      expect(result.data[0].staffCount).toBe(7);
    });

    it('defaults counts to 0 when the tenant schema query fails', async () => {
      const tenantPrisma = (service as any).tenantPrisma as jest.Mocked<TenantPrismaService>;
      (publicPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ count: '1' }])
        .mockResolvedValueOnce([
          {
            id: 'tenant-uuid-1',
            name: 'Test School',
            slug: 'testschool',
            is_active: true,
            created_at: new Date(),
            sub_status: 'ACTIVE',
            plan_name: 'Basic',
            plan_id: 'plan-uuid-1',
          },
        ]);
      (tenantPrisma.query as jest.Mock).mockRejectedValue(new Error('schema missing'));

      const result = await service.listTenants({ page: 1, limit: 20 });

      expect(result.data[0].studentCount).toBe(0);
      expect(result.data[0].staffCount).toBe(0);
    });
  });

  describe('updateTenant()', () => {
    it('updates allowed fields and never touches the slug', async () => {
      // UPDATE returns the id; getTenantDetail then re-reads the row
      (publicPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'tenant-uuid-1' }]) // UPDATE ... RETURNING id
        .mockResolvedValueOnce([
          {
            ...mockTenant,
            primary_color: '#2563EB',
            description: 'A great school',
            established_year: 1995,
            website: 'https://test.np',
          },
        ]); // getTenantDetail SELECT
      const tenantPrisma = (service as any).tenantPrisma as jest.Mocked<TenantPrismaService>;
      (tenantPrisma.query as jest.Mock).mockResolvedValue([{ students: '0', staff: '0' }]);

      const result = await service.updateTenant(
        'tenant-uuid-1',
        { schoolName: 'New Name', description: 'A great school', establishedYear: 1995 },
        'admin-uuid-1',
      );

      const updateSql = (publicPrisma.query as jest.Mock).mock.calls[0][0] as string;
      expect(updateSql).toContain('UPDATE tenants SET');
      expect(updateSql).toContain('name = $1');
      expect(updateSql).not.toMatch(/\bslug\b/);
      expect(result.establishedYear).toBe(1995);
      expect(audit.log).toHaveBeenCalledWith(
        'admin-uuid-1',
        'TENANT_UPDATED',
        'TENANT',
        'tenant-uuid-1',
        expect.any(Object),
      );
    });

    it('throws NotFoundException when the tenant does not exist', async () => {
      (publicPrisma.query as jest.Mock).mockResolvedValue([]);

      await expect(
        service.updateTenant('no-such-id', { schoolName: 'X' }, 'admin-uuid-1'),
      ).rejects.toThrow(NotFoundException);
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
        expect.stringContaining('"isActive" = false'),
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
