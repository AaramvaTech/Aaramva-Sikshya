import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';
import {
  TenantContext,
  TenantContextService,
} from '../tenant/tenant-context.service';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { Role } from '../common/enums/role.enum';
import { AuthUser, JwtPayload } from './auth.types';
import { CreateSchoolDto } from './dto/create-school.dto';
import { LoginDto } from './dto/login.dto';
import { TenantProvisioningService } from '../super-admin/tenant-provisioning.service';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface IssuedTokens {
  accessToken: string;
  refreshToken: string; // raw UUID — only ever sent to the client, never stored
  refreshExpiresAt: Date;
}

interface DbUser {
  id: string;
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly provisioning: TenantProvisioningService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ─── Register a new school + first SCHOOL_OWNER ────────────────────────────
  async register(dto: CreateSchoolDto) {
    const { tenant, user } = await this.provisioning.provision({
      schoolName: dto.schoolName,
      slug: dto.slug,
      adminEmail: dto.adminEmail,
      adminFirstName: dto.adminFirstName,
      adminLastName: dto.adminLastName,
      adminPassword: dto.password,
      phone: dto.phone,
      address: dto.address,
    });

    const ctx: TenantContext = {
      tenantId: tenant.id,
      slug: tenant.slug,
      schemaName: TenantService.schemaNameFor(tenant.slug),
    };

    const tokens = await this.tenantContext.run(ctx, () =>
      this.issueTokens({ id: user.id, email: user.email, role: user.role }, ctx),
    );

    return {
      ...tokens,
      school: tenant,
      user,
    };
  }

  // ─── Login (tenant resolved by middleware) ─────────────────────────────────
  async login(dto: LoginDto) {
    const ctx = this.tenantContext.getOrThrow();

    const rows = await this.tenantPrisma.query<DbUser & { password_hash: string; is_active: boolean }>(
      `SELECT id, email, role, password_hash, is_active
       FROM users WHERE email = $1 AND deleted_at IS NULL`,
      dto.email,
    );
    const user = rows[0];

    if (!user || !user.is_active) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(dto.password, user.password_hash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.tenantPrisma.execute(
      `UPDATE users SET last_login_at = NOW() WHERE id = $1::uuid`,
      user.id,
    );

    const tenantRows = await this.tenantPrisma.query<{ name: string; logoUrl: string | null }>(
      `SELECT name, "logoUrl" FROM public.tenants WHERE id = $1`,
      ctx.tenantId,
    );

    const tokens = await this.issueTokens(user, ctx);
    return {
      ...tokens,
      tenant: {
        name: tenantRows[0]?.name ?? ctx.slug,
        slug: ctx.slug,
        logoUrl: tenantRows[0]?.logoUrl ?? null,
      },
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  // ─── Refresh access token (rotates the refresh token) ──────────────────────
  async refresh(refreshToken: string | undefined) {
    const ctx = this.tenantContext.getOrThrow();
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    const tokenHash = this.hashToken(refreshToken);
    const rows = await this.tenantPrisma.query<{
      id: string;
      user_id: string;
      expires_at: Date;
      email: string;
      role: string;
    }>(
      `SELECT rt.id, rt.user_id, rt.expires_at, u.email, u.role
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1`,
      tokenHash,
    );
    const row = rows[0];

    if (!row || new Date(row.expires_at).getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate: delete the used token, issue a fresh pair.
    await this.tenantPrisma.execute(
      `DELETE FROM refresh_tokens WHERE id = $1::uuid`,
      row.id,
    );
    return this.issueTokens(
      { id: row.user_id, email: row.email, role: row.role },
      ctx,
    );
  }

  // ─── Logout (revoke the presented refresh token) ───────────────────────────
  async logout(
    refreshToken: string | undefined,
    options?: { expoPushToken?: string; userId?: string },
  ): Promise<void> {
    this.tenantContext.getOrThrow();
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.tenantPrisma.execute(
        `DELETE FROM refresh_tokens WHERE token_hash = $1`,
        tokenHash,
      );
    }
    if (options?.expoPushToken && options?.userId) {
      await this.tenantPrisma.execute(
        `DELETE FROM device_tokens WHERE token = $1 AND user_id = $2::uuid`,
        options.expoPushToken,
        options.userId,
      );
    }
  }

  // ─── Current user profile ──────────────────────────────────────────────────
  async getMe(user: AuthUser) {
    const rows = await this.tenantPrisma.query<{
      id: string; email: string; first_name: string; last_name: string;
      role: string; phone: string | null; avatar_url: string | null;
    }>(
      `SELECT id, email, first_name, last_name, role, phone, avatar_url
       FROM users WHERE id = $1::uuid AND deleted_at IS NULL`,
      user.userId,
    );
    if (!rows[0]) {
      throw new UnauthorizedException('User no longer exists');
    }

    let tenant: { name: string; slug: string; logoUrl: string | null } | null = null;
    if (user.tenantId) {
      const tenantRows = await this.tenantPrisma.query<{ name: string; logoUrl: string | null }>(
        `SELECT name, "logoUrl" FROM public.tenants WHERE id = $1`,
        user.tenantId,
      );
      if (tenantRows[0]) {
        tenant = {
          name: tenantRows[0].name,
          slug: user.tenantSlug ?? '',
          logoUrl: tenantRows[0].logoUrl,
        };
      }
    }

    const r = rows[0];
    return {
      id: r.id,
      email: r.email,
      firstName: r.first_name,
      lastName: r.last_name,
      role: r.role,
      phone: r.phone,
      avatarUrl: r.avatar_url,
      tenantId: user.tenantId,
      tenantSlug: user.tenantSlug,
      tenant,
    };
  }

  // ─── helpers ───────────────────────────────────────────────────────────────
  private async issueTokens(
    user: DbUser,
    ctx: TenantContext,
  ): Promise<IssuedTokens> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role as Role,
      tenantId: ctx.tenantId,
      tenantSlug: ctx.slug,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: (this.config.get<string>('JWT_ACCESS_EXPIRY') ??
        '15m') as JwtSignOptions['expiresIn'],
    });

    const refreshToken = randomUUID();
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    await this.tenantPrisma.execute(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1::uuid, $2, $3)`,
      user.id,
      this.hashToken(refreshToken),
      refreshExpiresAt,
    );

    return { accessToken, refreshToken, refreshExpiresAt };
  }

  /** Deterministic hash so refresh tokens can be looked up by value. */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
