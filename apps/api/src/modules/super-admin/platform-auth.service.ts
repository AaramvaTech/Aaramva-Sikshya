import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';
import { Role } from '../common/enums/role.enum';
import { errorBody } from '../common/errors/error-codes';
import { PublicPrismaService } from './public-prisma.service';
import { PlatformLoginDto } from './dto/platform-login.dto';

/** Mirrors the school session's 7-day refresh window (auth.service.ts). */
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface DbAdmin {
  id: string;
  email: string;
  password_hash: string;
  is_active: boolean;
  first_name: string;
  last_name: string;
}

export interface AdminIdentity {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
}

interface IssuedTokens {
  accessToken: string;
  /** Raw UUID — only ever sent to the client in the httpOnly cookie, never stored. */
  refreshToken: string;
  refreshExpiresAt: Date;
}

/**
 * Platform-admin auth. Sessions now survive a reload: login issues a rotating
 * refresh token (public.platform_refresh_tokens) alongside the 15-minute access
 * JWT, exactly like the school flow — but in the PUBLIC schema, because platform
 * admins are not tenant-bound.
 *
 * Only the SHA-256 hash is stored; the raw UUID lives solely in the httpOnly
 * `platform_refresh_token` cookie. Every refresh ROTATES (single-use), and
 * sessions are revocable: logout drops the presented token, a password change
 * drops all of that admin's tokens.
 */
@Injectable()
export class PlatformAuthService {
  constructor(
    private readonly publicPrisma: PublicPrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: PlatformLoginDto) {
    const rows = await this.publicPrisma.query<DbAdmin>(
      `SELECT id, email, password_hash, is_active, first_name, last_name
       FROM platform_admins WHERE email = $1`,
      dto.email,
    );
    const admin = rows[0];

    // Oracle-free: a disabled account is indistinguishable from a wrong password.
    if (!admin || !admin.is_active) {
      throw new UnauthorizedException(errorBody('AUTH_INVALID_CREDENTIALS'));
    }
    const ok = await bcrypt.compare(dto.password, admin.password_hash);
    if (!ok) {
      throw new UnauthorizedException(errorBody('AUTH_INVALID_CREDENTIALS'));
    }

    await this.publicPrisma.execute(
      `UPDATE platform_admins SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1::uuid`,
      admin.id,
    );

    const tokens = await this.issueTokens(admin.id, admin.email);
    return { ...tokens, admin: this.identityOf(admin) };
  }

  /**
   * Exchange a refresh token for a fresh pair. The presented token is SINGLE-USE:
   * it is deleted and replaced, so a leaked token stops working the moment the
   * real session refreshes (and vice-versa — the theft surfaces as a logout).
   */
  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) {
      throw new UnauthorizedException(errorBody('AUTH_SESSION_EXPIRED'));
    }

    const rows = await this.publicPrisma.query<{
      id: string;
      admin_id: string;
      expires_at: Date;
      email: string;
      is_active: boolean;
      first_name: string;
      last_name: string;
    }>(
      `SELECT rt.id, rt.admin_id, rt.expires_at, a.email, a.is_active, a.first_name, a.last_name
       FROM platform_refresh_tokens rt
       JOIN platform_admins a ON a.id = rt.admin_id
       WHERE rt.token_hash = $1`,
      this.hashToken(refreshToken),
    );
    const row = rows[0];

    if (!row || new Date(row.expires_at).getTime() < Date.now()) {
      throw new UnauthorizedException(errorBody('AUTH_SESSION_EXPIRED'));
    }
    if (!row.is_active) {
      // Admin disabled mid-session — drop every session they hold.
      await this.publicPrisma.execute(
        `DELETE FROM platform_refresh_tokens WHERE admin_id = $1::uuid`,
        row.admin_id,
      );
      throw new UnauthorizedException(errorBody('AUTH_ACCOUNT_DISABLED'));
    }

    // Rotate: burn the used token, issue a fresh pair.
    await this.publicPrisma.execute(
      `DELETE FROM platform_refresh_tokens WHERE id = $1::uuid`,
      row.id,
    );
    const tokens = await this.issueTokens(row.admin_id, row.email);
    return {
      ...tokens,
      admin: this.identityOf({
        id: row.admin_id,
        email: row.email,
        first_name: row.first_name,
        last_name: row.last_name,
      }),
    };
  }

  /** Revoke the presented session. Access JWTs still age out on their own (15m). */
  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) return;
    await this.publicPrisma.execute(
      `DELETE FROM platform_refresh_tokens WHERE token_hash = $1`,
      this.hashToken(refreshToken),
    );
  }

  /**
   * MAIL-1 T4: platform-admin password rotation is a form, not an operator script.
   * Now that platform sessions are refresh-backed, a change REVOKES every session
   * the admin holds — they must re-login everywhere.
   */
  async changePassword(
    adminId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ changed: true }> {
    const rows = await this.publicPrisma.query<DbAdmin>(
      `SELECT id, email, password_hash, is_active, first_name, last_name
       FROM platform_admins WHERE id = $1::uuid`,
      adminId,
    );
    const admin = rows[0];
    if (!admin || !admin.is_active || !(await bcrypt.compare(currentPassword, admin.password_hash))) {
      throw new UnauthorizedException(
        errorBody('AUTH_INVALID_CREDENTIALS', 'Current password is incorrect.'),
      );
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.publicPrisma.execute(
      `UPDATE platform_admins SET password_hash = $1, updated_at = NOW() WHERE id = $2::uuid`,
      passwordHash, adminId,
    );
    await this.publicPrisma.execute(
      `DELETE FROM platform_refresh_tokens WHERE admin_id = $1::uuid`,
      adminId,
    );
    return { changed: true };
  }

  // ─── helpers ───────────────────────────────────────────────────────────────

  /** The identity the web store needs: role gates the shell, names feed the header. */
  private identityOf(admin: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  }): AdminIdentity {
    return {
      id: admin.id,
      email: admin.email,
      firstName: admin.first_name,
      lastName: admin.last_name,
      role: Role.PLATFORM_ADMIN,
    };
  }

  private async issueTokens(adminId: string, email: string): Promise<IssuedTokens> {
    const accessToken = await this.jwt.signAsync(
      {
        sub: adminId,
        email,
        role: Role.PLATFORM_ADMIN,
        tenantId: null,
        tenantSlug: null,
      },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: (this.config.get<string>('JWT_ACCESS_EXPIRY') ?? '15m') as JwtSignOptions['expiresIn'],
      },
    );

    const refreshToken = randomUUID();
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    await this.publicPrisma.execute(
      `INSERT INTO platform_refresh_tokens (admin_id, token_hash, expires_at)
       VALUES ($1::uuid, $2, $3)`,
      adminId,
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
