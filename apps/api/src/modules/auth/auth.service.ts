import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { MAIL_EVENTS } from '../mail/mail.events';
import type { PasswordResetRequestedEvent } from '../mail/mail.events';
import { generateTemporaryPassword } from '../mail/password.util';
import {
  TenantContext,
  TenantContextService,
} from '../tenant/tenant-context.service';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { Role } from '../common/enums/role.enum';
import { errorBody } from '../common/errors/error-codes';
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
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly provisioning: TenantProvisioningService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {}

  // ─── Register a new school + first SCHOOL_OWNER ────────────────────────────
  async register(dto: CreateSchoolDto) {
    // REG-OBS-5: the SCHOOL_OWNER is a REG-1 account like any other — a generated
    // temp password, must_change_password = true, delivered via the new tenant's
    // ledger (the Phase-4 enqueue in provision fires because mustChangePassword=true).
    const adminPassword = generateTemporaryPassword();
    const { tenant, user } = await this.provisioning.provision({
      schoolName: dto.schoolName,
      slug: dto.slug,
      adminEmail: dto.adminEmail,
      adminFirstName: dto.adminFirstName,
      adminLastName: dto.adminLastName,
      adminPassword,
      mustChangePassword: true,
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
      // REG-OBS-5: flag the forced change so the web form redirects to change-password.
      user: { ...user, mustChangePassword: true },
    };
  }

  // ─── Login (tenant resolved by middleware) ─────────────────────────────────
  async login(dto: LoginDto) {
    const ctx = this.tenantContext.getOrThrow();

    const rows = await this.tenantPrisma.query<
      DbUser & { password_hash: string; is_active: boolean; must_change_password: boolean }
    >(
      `SELECT id, email, role, password_hash, is_active, must_change_password
       FROM users WHERE email = $1 AND deleted_at IS NULL`,
      dto.email,
    );
    const user = rows[0];

    if (!user || !user.is_active) {
      throw new UnauthorizedException(errorBody('AUTH_INVALID_CREDENTIALS'));
    }
    const ok = await bcrypt.compare(dto.password, user.password_hash);
    if (!ok) {
      throw new UnauthorizedException(errorBody('AUTH_INVALID_CREDENTIALS'));
    }

    await this.tenantPrisma.execute(
      `UPDATE users SET last_login_at = NOW() WHERE id = $1::uuid`,
      user.id,
    );

    const tenantRows = await this.tenantPrisma.query<{
      name: string;
      logoUrl: string | null;
      primaryColor: string | null;
      primaryForeground: string | null;
    }>(
      `SELECT name, "logoUrl", "primaryColor", "primaryForeground"
       FROM public.tenants WHERE id = $1`,
      ctx.tenantId,
    );

    const tokens = await this.issueTokens(user, ctx);
    return {
      ...tokens,
      tenant: {
        name: tenantRows[0]?.name ?? ctx.slug,
        slug: ctx.slug,
        logoUrl: tenantRows[0]?.logoUrl ?? null,
        primaryColor: tenantRows[0]?.primaryColor ?? null,
        primaryForeground: tenantRows[0]?.primaryForeground ?? null,
      },
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        // POL-1 T4: true while an emailed temporary password is in effect —
        // the web shell keeps the user on change-password until it clears.
        mustChangePassword: user.must_change_password,
      },
    };
  }

  // ─── Refresh access token (rotates the refresh token) ──────────────────────
  async refresh(refreshToken: string | undefined) {
    const ctx = this.tenantContext.getOrThrow();
    if (!refreshToken) {
      throw new UnauthorizedException(errorBody('AUTH_SESSION_EXPIRED'));
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
      throw new UnauthorizedException(errorBody('AUTH_SESSION_EXPIRED'));
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
      must_change_password: boolean;
    }>(
      `SELECT id, email, first_name, last_name, role, phone, avatar_url, must_change_password
       FROM users WHERE id = $1::uuid AND deleted_at IS NULL`,
      user.userId,
    );
    if (!rows[0]) {
      throw new UnauthorizedException(errorBody('AUTH_TOKEN_INVALID'));
    }

    let tenant: {
      name: string;
      slug: string;
      logoUrl: string | null;
      primaryColor: string | null;
      primaryForeground: string | null;
    } | null = null;
    if (user.tenantId) {
      const tenantRows = await this.tenantPrisma.query<{
        name: string;
        logoUrl: string | null;
        primaryColor: string | null;
        primaryForeground: string | null;
      }>(
        `SELECT name, "logoUrl", "primaryColor", "primaryForeground"
         FROM public.tenants WHERE id = $1`,
        user.tenantId,
      );
      if (tenantRows[0]) {
        tenant = {
          name: tenantRows[0].name,
          slug: user.tenantSlug ?? '',
          logoUrl: tenantRows[0].logoUrl,
          primaryColor: tenantRows[0].primaryColor,
          primaryForeground: tenantRows[0].primaryForeground,
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
      mustChangePassword: r.must_change_password,
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

  // ─── Password reset + change (MAIL-1 T3/T4) ────────────────────────────────

  /**
   * Oracle-free: ALWAYS resolves void; the controller returns the same generic
   * 200 whether or not the account exists. Token: 32 random bytes, stored
   * SHA-256-hashed, 30-min expiry, single-use.
   */
  async forgotPassword(email: string): Promise<void> {
    const { tenantId, slug } = this.tenantContext.getOrThrow();
    const users = await this.tenantPrisma.query<{ id: string; email: string }>(
      `SELECT id, email FROM users WHERE email = $1 AND deleted_at IS NULL`,
      email,
    );
    if (!users[0]) {
      this.logger.log(`forgot-password: no account for the requested email — skipped (no email sent)`);
      return;
    }
    const user = users[0];

    const token = randomBytes(32).toString('hex');
    await this.tenantPrisma.execute(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1::uuid, $2, NOW() + interval '30 minutes')`,
      user.id,
      this.hashToken(token),
    );

    const domain = this.config.get<string>('APP_DOMAIN') || 'aaramvashikshya.com';
    // tenant param is redundant with the subdomain in prod but lets the reset
    // page resolve the school when opened on a non-subdomain host (dev).
    const resetUrl = `https://${slug}.${domain}/reset-password?token=${token}&tenant=${slug}`;
    this.events.emit(MAIL_EVENTS.passwordResetRequested, {
      tenantId, to: user.email, resetUrl, relatedUserId: user.id,
    } satisfies PasswordResetRequestedEvent);
  }

  /**
   * Single-use is enforced by an atomic claim: the UPDATE only wins if the
   * token is unused and unexpired. On success every refresh token AND every
   * other outstanding reset token for the user is invalidated.
   */
  async resetPassword(token: string, newPassword: string): Promise<{ reset: true }> {
    const claimed = await this.tenantPrisma.query<{ user_id: string }>(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       RETURNING user_id`,
      this.hashToken(token),
    );
    if (!claimed[0]) {
      throw new BadRequestException('Invalid or expired reset token');
    }
    const userId = claimed[0].user_id;

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.tenantPrisma.run(async (tx) => {
      // The user chose this password themselves → any temp-password force clears.
      await tx.$executeRawUnsafe(
        `UPDATE users SET password_hash = $1, must_change_password = false, updated_at = NOW()
         WHERE id = $2::uuid`,
        passwordHash, userId,
      );
      // Force re-login everywhere + void any other outstanding reset links.
      await tx.$executeRawUnsafe(`DELETE FROM refresh_tokens WHERE user_id = $1::uuid`, userId);
      await tx.$executeRawUnsafe(
        `UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1::uuid AND used_at IS NULL`,
        userId,
      );
    });
    return { reset: true };
  }

  /** Authenticated change: verifies the current password, revokes sessions. */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ changed: true }> {
    const rows = await this.tenantPrisma.query<{ id: string; password_hash: string }>(
      `SELECT id, password_hash FROM users WHERE id = $1::uuid AND deleted_at IS NULL`,
      userId,
    );
    if (!rows[0] || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
      throw new UnauthorizedException(
        errorBody('AUTH_INVALID_CREDENTIALS', 'Current password is incorrect.'),
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.tenantPrisma.run(async (tx) => {
      // POL-1 T4: changing the password clears the first-login force flag.
      await tx.$executeRawUnsafe(
        `UPDATE users SET password_hash = $1, must_change_password = false, updated_at = NOW()
         WHERE id = $2::uuid`,
        passwordHash, userId,
      );
      await tx.$executeRawUnsafe(`DELETE FROM refresh_tokens WHERE user_id = $1::uuid`, userId);
      await tx.$executeRawUnsafe(
        `UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1::uuid AND used_at IS NULL`,
        userId,
      );
    });
    return { changed: true };
  }
}
