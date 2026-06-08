import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { adToBs } from 'bs-calendar';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantService } from '../tenant/tenant.service';
import { PublicPrismaService } from './public-prisma.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { AuditService } from './audit.service';
import {
  ManualOnboardTenantDto,
  UpdateSubscriptionDto,
  ListTenantsQueryDto,
} from './dto/tenant-admin.dto';

interface DbTenant {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  pan_number: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface DbSubscription {
  id: string;
  tenant_id: string;
  plan_id: string;
  plan_name: string;
  status: string;
  trial_ends_at: Date | null;
  starts_at: Date;
  ends_at: Date | null;
}

function toDateField(d: Date | null | undefined) {
  if (!d) return null;
  const dt = new Date(d);
  const bs = adToBs(dt);
  return {
    ad: dt.toISOString(),
    bs: `${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')}`,
  };
}

@Injectable()
export class TenantAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publicPrisma: PublicPrismaService,
    private readonly provisioning: TenantProvisioningService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly tenantService: TenantService,
    private readonly audit: AuditService,
  ) {}

  async onboardTenant(dto: ManualOnboardTenantDto, adminId: string) {
    const result = await this.provisioning.provision({
      schoolName: dto.schoolName,
      slug: dto.slug,
      adminEmail: dto.adminEmail,
      adminFirstName: dto.adminFirstName,
      adminLastName: dto.adminLastName,
      adminPassword: dto.adminPassword,
      planId: dto.planId,
      phone: dto.phone,
      address: dto.address,
      panNumber: dto.panNumber,
      trialDays: dto.trialDays,
    });

    await this.audit.log(adminId, 'TENANT_CREATED', 'TENANT', result.tenant.id, {
      slug: dto.slug,
      planId: dto.planId,
    });

    return result;
  }

  async listTenants(query: ListTenantsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = ['t.deleted_at IS NULL'];
    const params: unknown[] = [];

    if (query.search) {
      params.push(`%${query.search}%`);
      conditions.push(`(t.name ILIKE $${params.length} OR t.slug ILIKE $${params.length})`);
    }
    if (query.status) {
      params.push(query.status);
      conditions.push(`s.status = $${params.length}`);
    }
    if (query.planId) {
      params.push(query.planId);
      conditions.push(`s.plan_id = $${params.length}::uuid`);
    }

    const where = conditions.join(' AND ');

    const countRows = await this.publicPrisma.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM tenants t
       LEFT JOIN subscriptions s ON s.tenant_id = t.id
       WHERE ${where}`,
      ...params,
    );
    const total = parseInt(countRows[0]?.count ?? '0', 10);

    params.push(limit, offset);
    const rows = await this.publicPrisma.query<
      DbTenant & { sub_status: string; plan_name: string; plan_id: string }
    >(
      `SELECT t.*, s.status AS sub_status, p.name AS plan_name, p.id AS plan_id
       FROM tenants t
       LEFT JOIN subscriptions s ON s.tenant_id = t.id
       LEFT JOIN plans p ON p.id = s.plan_id
       WHERE ${where}
       ORDER BY t.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      ...params,
    );

    return {
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        isActive: r.is_active,
        subscription: { status: r.sub_status, planName: r.plan_name, planId: r.plan_id },
        createdAt: toDateField(r.created_at),
      })),
      meta: { page, limit, total },
    };
  }

  async getTenantDetail(id: string) {
    const rows = await this.publicPrisma.query<
      DbTenant & DbSubscription & { plan_name: string }
    >(
      `SELECT t.*,
              s.id AS sub_id, s.plan_id, s.status, s.trial_ends_at,
              s.starts_at, s.ends_at,
              p.name AS plan_name
       FROM tenants t
       LEFT JOIN subscriptions s ON s.tenant_id = t.id
       LEFT JOIN plans p ON p.id = s.plan_id
       WHERE t.id = $1::uuid AND t.deleted_at IS NULL`,
      id,
    );
    const row = rows[0];
    if (!row) throw new NotFoundException(`Tenant ${id} not found`);

    // Fetch usage stats from tenant schema
    let studentCount = 0;
    let staffCount = 0;
    try {
      const ctx = {
        tenantId: row.id,
        slug: row.slug,
        schemaName: TenantService.schemaNameFor(row.slug),
      };
      const statsRows = await this.tenantContext.run(ctx, () =>
        this.tenantPrisma.query<{ students: string; staff: string }>(
          `SELECT
             (SELECT COUNT(*) FROM students WHERE deleted_at IS NULL) AS students,
             (SELECT COUNT(*) FROM staff_profiles WHERE deleted_at IS NULL) AS staff`,
        ),
      );
      studentCount = parseInt(statsRows[0]?.students ?? '0', 10);
      staffCount = parseInt(statsRows[0]?.staff ?? '0', 10);
    } catch {
      // Schema may not be provisioned yet — stats default to 0
    }

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      logoUrl: row.logo_url,
      address: row.address,
      phone: row.phone,
      email: row.email,
      panNumber: row.pan_number,
      isActive: row.is_active,
      createdAt: toDateField(new Date(row.created_at)),
      subscription: {
        id: (row as any).sub_id,
        planId: row.plan_id,
        planName: row.plan_name,
        status: row.status,
        trialEndsAt: toDateField(row.trial_ends_at),
        startsAt: toDateField(new Date(row.starts_at)),
        endsAt: toDateField(row.ends_at),
      },
      usage: { studentCount, staffCount },
    };
  }

  async suspendTenant(id: string, adminId: string) {
    const rows = await this.publicPrisma.query<{ id: string; slug: string }>(
      `UPDATE tenants SET is_active = false, updated_at = NOW()
       WHERE id = $1::uuid AND deleted_at IS NULL RETURNING id, slug`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Tenant ${id} not found`);
    await this.audit.log(adminId, 'TENANT_SUSPENDED', 'TENANT', id);
    return { id: rows[0].id, slug: rows[0].slug, isActive: false };
  }

  async activateTenant(id: string, adminId: string) {
    const rows = await this.publicPrisma.query<{ id: string; slug: string }>(
      `UPDATE tenants SET is_active = true, updated_at = NOW()
       WHERE id = $1::uuid AND deleted_at IS NULL RETURNING id, slug`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Tenant ${id} not found`);
    await this.audit.log(adminId, 'TENANT_ACTIVATED', 'TENANT', id);
    return { id: rows[0].id, slug: rows[0].slug, isActive: true };
  }

  async updateSubscription(tenantId: string, dto: UpdateSubscriptionDto, adminId: string) {
    const sets: string[] = [];
    const params: unknown[] = [tenantId];

    if (dto.planId) {
      params.push(dto.planId);
      sets.push(`plan_id = $${params.length}::uuid`);
    }
    if (dto.status) {
      params.push(dto.status);
      sets.push(`status = $${params.length}`);
    }
    if (dto.endsAt) {
      params.push(new Date(dto.endsAt));
      sets.push(`ends_at = $${params.length}`);
    }

    if (sets.length === 0) {
      return this.publicPrisma.query(
        `SELECT * FROM subscriptions WHERE tenant_id = $1::uuid`,
        tenantId,
      );
    }

    sets.push(`updated_at = NOW()`);
    const rows = await this.publicPrisma.query<{ id: string; status: string; plan_id: string }>(
      `UPDATE subscriptions SET ${sets.join(', ')}
       WHERE tenant_id = $1::uuid RETURNING id, status, plan_id`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Subscription for tenant ${tenantId} not found`);

    await this.audit.log(adminId, 'SUBSCRIPTION_CHANGED', 'TENANT', tenantId, {
      planId: dto.planId,
      status: dto.status,
    });

    return rows[0];
  }
}
