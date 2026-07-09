import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { TenantMigrationService } from '../tenant/tenant-migration.service';
import { Role } from '../common/enums/role.enum';

const BCRYPT_ROUNDS = 12;
const DEFAULT_TRIAL_DAYS = 30;

export interface ProvisionInput {
  schoolName: string;
  slug: string;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  adminPassword: string;
  planId?: string; // if omitted, picks cheapest active plan
  phone?: string;
  address?: string;
  panNumber?: string;
  trialDays?: number;
}

export interface ProvisionResult {
  tenant: { id: string; name: string; slug: string };
  user: { id: string; email: string; firstName: string; lastName: string; role: string };
}

@Injectable()
export class TenantProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly tenantMigration: TenantMigrationService,
  ) {}

  async provision(input: ProvisionInput): Promise<ProvisionResult> {
    if (!TenantService.isValidSlug(input.slug)) {
      throw new ConflictException('Invalid school slug');
    }

    const existing = await this.prisma.tenant.findUnique({
      where: { slug: input.slug },
    });
    if (existing) {
      throw new ConflictException(`School slug "${input.slug}" is already taken`);
    }

    let planId = input.planId;
    if (!planId) {
      const plan = await this.prisma.plan.findFirst({
        where: { isActive: true },
        orderBy: { monthlyPrice: 'asc' },
      });
      if (!plan) {
        throw new ConflictException(
          'No subscription plans are configured. Seed the plans table first.',
        );
      }
      planId = plan.id;
    }

    const trialDays = input.trialDays ?? DEFAULT_TRIAL_DAYS;

    const tenant = await this.prisma.tenant.create({
      data: {
        name: input.schoolName,
        slug: input.slug,
        email: input.adminEmail,
        phone: input.phone,
        address: input.address,
        panNumber: input.panNumber,
        subscription: {
          create: {
            planId,
            status: 'TRIAL',
            trialEndsAt: new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000),
          },
        },
      },
    });

    const ctx = {
      tenantId: tenant.id,
      slug: tenant.slug,
      schemaName: TenantService.schemaNameFor(tenant.slug),
    };

    try {
      // Provision via the migration runner (MIG-1): it creates the schema, the
      // _tenant_migrations ledger, and applies every migration from 0001. New
      // tenants therefore share a byte-identical schema history with migrated
      // ones. (Replaces the old tenant-schema.sql one-shot.)
      await this.tenantMigration.migrateSchema(ctx.schemaName, { label: input.slug });

      return await this.tenantContext.run(ctx, async () => {
        const passwordHash = await bcrypt.hash(input.adminPassword, BCRYPT_ROUNDS);
        const rows = await this.tenantPrisma.query<{
          id: string;
          email: string;
          first_name: string;
          last_name: string;
          role: string;
        }>(
          `INSERT INTO users (email, password_hash, first_name, last_name, role)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, email, first_name, last_name, role`,
          input.adminEmail,
          passwordHash,
          input.adminFirstName,
          input.adminLastName,
          Role.SCHOOL_OWNER,
        );
        const user = rows[0];

        return {
          tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
          user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            role: user.role,
          },
        };
      });
    } catch (err) {
      await this.prisma
        .$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${ctx.schemaName}" CASCADE`)
        .catch(() => undefined);
      await this.prisma.subscription
        .deleteMany({ where: { tenantId: tenant.id } })
        .catch(() => undefined);
      await this.prisma.tenant
        .delete({ where: { id: tenant.id } })
        .catch(() => undefined);
      throw err;
    }
  }
}
