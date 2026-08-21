import { ConflictException, NotFoundException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { TenantMigrationService } from '../tenant/tenant-migration.service';
import { Role } from '../common/enums/role.enum';
import {
  CredentialDeliveryService,
  DeliveryTarget,
} from '../credential-delivery/credential-delivery.service';
import { credentialKeyConfigured } from '../credential-delivery/credential-crypto.util';
import { toE164Nepal } from '../common/utils/phone.util';

const BCRYPT_ROUNDS = 12;
const DEFAULT_TRIAL_DAYS = 30;

export interface ProvisionInput {
  schoolName: string;
  slug: string;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  adminPassword: string;
  /** POL-1 T4: true when adminPassword was generated (not chosen by the owner). */
  mustChangePassword?: boolean;
  planId?: string; // if omitted, picks cheapest active plan
  phone?: string;
  address?: string;
  panNumber?: string;
  trialDays?: number;
}

export interface ProvisionResult {
  tenant: { id: string; name: string; slug: string };
  user: { id: string; email: string; firstName: string; lastName: string; role: string };
  /** REG-1: true when the owner's credentials were enqueued on the tenant ledger. */
  enqueued: boolean;
}

@Injectable()
export class TenantProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly tenantMigration: TenantMigrationService,
    private readonly credentialDelivery: CredentialDeliveryService,
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
    if (planId) {
      // ERR-MAP-1 ruling 2: the ONLY reachable Prisma P2003 in the codebase was
      // here — a super-admin-supplied planId that is @IsUUID-shape-checked and
      // went straight into the nested `subscription.create`, surfacing as an
      // opaque 500. Removed at source rather than mapped in the filter: one
      // call site does not justify filter-level work, and a 404 that names the
      // plan is a better answer than any generic mapping could produce.
      const chosen = await this.prisma.plan.findUnique({ where: { id: planId } });
      if (!chosen) throw new NotFoundException(`Plan ${planId} not found`);
    }
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
        const generated = input.mustChangePassword ?? false;
        const phoneE164 = input.phone ? toE164Nepal(input.phone) ?? input.phone : null;

        // REG-1 §4 / REG-OBS-2: create the SCHOOL_OWNER and, when the password was
        // generated + a key is configured, enqueue delivery on THIS (new) tenant's
        // own ledger — inside one transaction. No platform ledger.
        const { user, enqueued } = await this.tenantPrisma.run(async (tx) => {
          const rows = await tx.$queryRawUnsafe<{
            id: string;
            email: string;
            first_name: string;
            last_name: string;
            role: string;
          }>(
            `INSERT INTO users (email, password_hash, first_name, last_name, role, phone, must_change_password)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, email, first_name, last_name, role`,
            input.adminEmail,
            passwordHash,
            input.adminFirstName,
            input.adminLastName,
            Role.SCHOOL_OWNER,
            phoneE164,
            generated,
          );
          const u = rows[0];
          let enq = false;
          if (generated && credentialKeyConfigured()) {
            const targets: DeliveryTarget[] = [
              { channel: 'EMAIL', recipient: input.adminEmail, templateType: 'NEW_SCHOOL_OWNER' },
            ];
            if (phoneE164) targets.push({ channel: 'SMS', recipient: phoneE164, templateType: 'NEW_SCHOOL_OWNER' });
            await this.credentialDelivery.enqueueInTx(tx, {
              userId: u.id,
              plaintext: input.adminPassword,
              targets,
            });
            enq = true;
          }
          return { user: u, enqueued: enq };
        });

        return {
          tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
          user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            role: user.role,
          },
          enqueued,
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
