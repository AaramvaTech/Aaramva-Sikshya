import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { PublicPrismaService } from './public-prisma.service';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantService } from '../tenant/tenant.service';
import { AuditService } from './audit.service';
import { Role } from '../common/enums/role.enum';

const IMPERSONATION_TTL = '1h';

interface DbUser {
  id: string;
  email: string;
  role: string;
}

@Injectable()
export class ImpersonationService {
  constructor(
    private readonly publicPrisma: PublicPrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async impersonate(tenantId: string, adminId: string, adminEmail: string) {
    const tenantRows = await this.publicPrisma.query<{ id: string; slug: string; name: string; is_active: boolean }>(
      `SELECT id, slug, name, is_active FROM tenants WHERE id = $1::uuid AND deleted_at IS NULL`,
      tenantId,
    );
    const tenant = tenantRows[0];
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);

    const ctx = {
      tenantId: tenant.id,
      slug: tenant.slug,
      schemaName: TenantService.schemaNameFor(tenant.slug),
    };

    const users = await this.tenantContext.run(ctx, () =>
      this.tenantPrisma.query<DbUser>(
        `SELECT id, email, role FROM users WHERE role = $1 AND deleted_at IS NULL LIMIT 1`,
        Role.SCHOOL_OWNER,
      ),
    );

    const owner = users[0];
    if (!owner) {
      throw new NotFoundException(`No SCHOOL_OWNER found in tenant ${tenant.slug}`);
    }

    await this.audit.log(adminId, 'IMPERSONATION', 'TENANT', tenantId, {
      adminId,
      adminEmail,
      impersonatedUserId: owner.id,
    });

    const accessToken = await this.jwt.signAsync(
      {
        sub: owner.id,
        email: owner.email,
        role: Role.SCHOOL_OWNER,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
      },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: IMPERSONATION_TTL as JwtSignOptions['expiresIn'],
      },
    );

    return {
      accessToken,
      tenantSlug: tenant.slug,
      schoolName: tenant.name,
      warning: 'This token grants SCHOOL_OWNER access. All actions are audited.',
    };
  }
}
