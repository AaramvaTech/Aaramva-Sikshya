import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  UpdateTenantDto,
  ListTenantsQueryDto,
} from './dto/tenant-admin.dto';
import { BrandingColorService, contrastRatio } from '../branding/branding-color.service';

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

interface DbTenant {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  pan_number: string | null;
  is_active: boolean;
  created_at: Date;
}

interface DbSubscription {
  id: string;
  plan_id: string;
  plan_name: string;
  status: string;
  trial_ends_at: Date | null;
  starts_at: Date;
  ends_at: Date | null;
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
    private readonly brandingColor: BrandingColorService,
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

    const conditions: string[] = ['t."deletedAt" IS NULL'];
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
      conditions.push(`s."planId" = $${params.length}`);
    }

    const where = conditions.join(' AND ');

    const countRows = await this.publicPrisma.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM tenants t
       LEFT JOIN subscriptions s ON s."tenantId" = t.id
       WHERE ${where}`,
      ...params,
    );
    const total = parseInt(countRows[0]?.count ?? '0', 10);

    params.push(limit, offset);
    const rows = await this.publicPrisma.query<
      DbTenant & { sub_status: string; plan_name: string; plan_id: string }
    >(
      `SELECT t.id, t.name, t.slug, t."logoUrl" AS logo_url,
              t."isActive" AS is_active, t."createdAt" AS created_at,
              s.status AS sub_status, p.name AS plan_name, p.id AS plan_id
       FROM tenants t
       LEFT JOIN subscriptions s ON s."tenantId" = t.id
       LEFT JOIN plans p ON p.id = s."planId"
       WHERE ${where}
       ORDER BY t."createdAt" DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      ...params,
    );

    const data = await Promise.all(
      rows.map(async (r) => {
        const usage = await this.getUsageStats(r.id, r.slug);
        return {
          id: r.id,
          name: r.name,
          slug: r.slug,
          logoUrl: r.logo_url,
          isActive: r.is_active,
          planName: r.plan_name ?? '',
          subscriptionStatus: r.sub_status ?? '',
          studentCount: usage.studentCount,
          staffCount: usage.staffCount,
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
        };
      }),
    );

    return {
      data,
      meta: { page, limit, total },
    };
  }

  /**
   * Counts active students and staff inside a tenant's own Postgres schema.
   * Returns zeros if the schema is not provisioned yet or the query fails.
   */
  private async getUsageStats(
    tenantId: string,
    slug: string,
  ): Promise<{ studentCount: number; staffCount: number }> {
    try {
      const ctx = {
        tenantId,
        slug,
        schemaName: TenantService.schemaNameFor(slug),
      };
      const statsRows = await this.tenantContext.run(ctx, () =>
        this.tenantPrisma.query<{ students: string; staff: string }>(
          `SELECT
             (SELECT COUNT(*) FROM students WHERE deleted_at IS NULL) AS students,
             (SELECT COUNT(*) FROM staff_profiles WHERE deleted_at IS NULL) AS staff`,
        ),
      );
      return {
        studentCount: parseInt(statsRows[0]?.students ?? '0', 10),
        staffCount: parseInt(statsRows[0]?.staff ?? '0', 10),
      };
    } catch {
      // Schema may not be provisioned yet — stats default to 0
      return { studentCount: 0, staffCount: 0 };
    }
  }

  async getTenantDetail(id: string) {
    const rows = await this.publicPrisma.query<
      DbTenant & DbSubscription & { plan_name: string }
    >(
      `SELECT t.id, t.name, t.slug,
              t."logoUrl" AS logo_url, t."primaryColor" AS primary_color,
              t.description, t."establishedYear" AS established_year, t.website,
              t.address, t.phone, t.email,
              t."panNumber" AS pan_number, t."isActive" AS is_active, t."createdAt" AS created_at,
              s.id AS sub_id, s."planId" AS plan_id, s.status, s."trialEndsAt" AS trial_ends_at,
              s."startsAt" AS starts_at, s."endsAt" AS ends_at,
              p.name AS plan_name
       FROM tenants t
       LEFT JOIN subscriptions s ON s."tenantId" = t.id
       LEFT JOIN plans p ON p.id = s."planId"
       WHERE t.id = $1 AND t."deletedAt" IS NULL`,
      id,
    );
    const row = rows[0];
    if (!row) throw new NotFoundException(`Tenant ${id} not found`);

    const { studentCount, staffCount } = await this.getUsageStats(row.id, row.slug);

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      logoUrl: row.logo_url,
      primaryColor: row.primary_color ?? '#2563EB',
      description: (row as any).description ?? null,
      establishedYear: (row as any).established_year ?? null,
      website: (row as any).website ?? null,
      address: row.address,
      phone: row.phone,
      email: row.email,
      panNumber: row.pan_number,
      isActive: row.is_active,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      planId: row.plan_id ?? '',
      planName: row.plan_name ?? '',
      subscriptionStatus: (row as any).status ?? '',
      trialEndsAt: (row as any).trial_ends_at ? new Date((row as any).trial_ends_at).toISOString() : null,
      subscriptionEndsAt: (row as any).ends_at ? new Date((row as any).ends_at).toISOString() : null,
      studentCount,
      staffCount,
    };
  }

  async updateTenant(id: string, dto: UpdateTenantDto, adminId: string) {
    // slug is intentionally NOT updatable — it is the permanent subdomain + schema key.
    const columnFor: Record<string, string> = {
      schoolName: 'name',
      logoUrl: '"logoUrl"',
      primaryColor: '"primaryColor"',
      description: 'description',
      establishedYear: '"establishedYear"',
      website: 'website',
      address: 'address',
      phone: 'phone',
      email: 'email',
      panNumber: '"panNumber"',
    };

    const sets: string[] = [];
    const params: unknown[] = [];

    for (const [key, column] of Object.entries(columnFor)) {
      const value = (dto as Record<string, unknown>)[key];
      if (value !== undefined) {
        params.push(value);
        sets.push(`${column} = $${params.length}`);
      }
    }

    if (dto.primaryColor !== undefined) {
      const fg = contrastRatio(dto.primaryColor, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#0B1220';
      params.push(fg);
      sets.push(`"primaryForeground" = $${params.length}`);
      sets.push(`"colorSource" = 'manual'`);
    }

    if (sets.length === 0) {
      return this.getTenantDetail(id);
    }

    params.push(id);
    const rows = await this.publicPrisma.query<{ id: string }>(
      `UPDATE tenants SET ${sets.join(', ')}, "updatedAt" = NOW()
       WHERE id = $${params.length} AND "deletedAt" IS NULL
       RETURNING id`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Tenant ${id} not found`);

    await this.audit.log(adminId, 'TENANT_UPDATED', 'TENANT', id, {
      fields: Object.keys(columnFor).filter(
        (k) => (dto as Record<string, unknown>)[k] !== undefined,
      ),
    });

    if (dto.logoUrl !== undefined) {
      const csRows = await this.publicPrisma.query<{ color_source: string }>(
        `SELECT "colorSource" AS color_source FROM tenants WHERE id = $1`,
        id,
      );
      const colorSource = csRows[0]?.color_source ?? 'auto';
      if (colorSource !== 'manual') {
        const buffer = await fetchImageBuffer(dto.logoUrl);
        if (buffer) {
          const result = await this.brandingColor.deriveThemeFromLogo(buffer);
          if (result) {
            await this.publicPrisma.query(
              `UPDATE tenants
               SET "primaryColor" = $1, "primaryForeground" = $2,
                   "colorSource" = 'auto', "logoPalette" = $3, "updatedAt" = NOW()
               WHERE id = $4`,
              result.primaryColor,
              result.primaryForeground,
              JSON.stringify(result.palette),
              id,
            );
          }
        }
      }
    }

    return this.getTenantDetail(id);
  }

  async suspendTenant(id: string, adminId: string) {
    const rows = await this.publicPrisma.query<{ id: string; slug: string }>(
      `UPDATE tenants SET "isActive" = false, "updatedAt" = NOW()
       WHERE id = $1 AND "deletedAt" IS NULL RETURNING id, slug`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Tenant ${id} not found`);
    await this.audit.log(adminId, 'TENANT_SUSPENDED', 'TENANT', id);
    return { id: rows[0].id, slug: rows[0].slug, isActive: false };
  }

  async activateTenant(id: string, adminId: string) {
    const rows = await this.publicPrisma.query<{ id: string; slug: string }>(
      `UPDATE tenants SET "isActive" = true, "updatedAt" = NOW()
       WHERE id = $1 AND "deletedAt" IS NULL RETURNING id, slug`,
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
      sets.push(`"planId" = $${params.length}`);
    }
    if (dto.status) {
      params.push(dto.status);
      sets.push(`status = $${params.length}`);
    }
    if (dto.endsAt) {
      params.push(new Date(dto.endsAt));
      sets.push(`"endsAt" = $${params.length}`);
    }

    if (sets.length === 0) {
      return this.publicPrisma.query(
        `SELECT * FROM subscriptions WHERE "tenantId" = $1`,
        tenantId,
      );
    }

    sets.push(`"updatedAt" = NOW()`);
    const rows = await this.publicPrisma.query<{ id: string; status: string; planId: string }>(
      `UPDATE subscriptions SET ${sets.join(', ')}
       WHERE "tenantId" = $1 RETURNING id, status, "planId"`,
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
