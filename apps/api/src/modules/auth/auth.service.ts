import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
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

const BCRYPT_ROUNDS = 12;
const TRIAL_DAYS = 30;
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
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ─── Register a new school + first SCHOOL_OWNER ────────────────────────────
  async register(dto: CreateSchoolDto) {
    if (!TenantService.isValidSlug(dto.slug)) {
      throw new ConflictException('Invalid school slug');
    }

    const existing = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException(`School slug "${dto.slug}" is already taken`);
    }

    const plan = await this.prisma.plan.findFirst({
      where: { isActive: true },
      orderBy: { monthlyPrice: 'asc' },
    });
    if (!plan) {
      throw new ConflictException(
        'No subscription plans are configured. Seed the plans table first.',
      );
    }

    // 1) tenant + trial subscription (public schema)
    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.schoolName,
        slug: dto.slug,
        email: dto.adminEmail,
        phone: dto.phone,
        address: dto.address,
        subscription: {
          create: {
            planId: plan.id,
            status: 'TRIAL',
            trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
          },
        },
      },
    });

    const ctx: TenantContext = {
      tenantId: tenant.id,
      slug: tenant.slug,
      schemaName: TenantService.schemaNameFor(tenant.slug),
    };

    try {
      // 2) provision the tenant's isolated schema
      await this.tenantService.provisionSchema(dto.slug);

      // 3) create the first user + issue tokens, bound to the new tenant context
      return await this.tenantContext.run(ctx, async () => {
        const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
        const rows = await this.tenantPrisma.query<DbUser & { first_name: string; last_name: string }>(
          `INSERT INTO users (email, password_hash, first_name, last_name, role)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, email, first_name, last_name, role`,
          dto.adminEmail,
          passwordHash,
          dto.adminFirstName,
          dto.adminLastName,
          Role.SCHOOL_OWNER,
        );
        const user = rows[0];
        const tokens = await this.issueTokens(user, ctx);

        return {
          ...tokens,
          school: { id: tenant.id, name: tenant.name, slug: tenant.slug },
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
      // Compensate: don't leave a half-created school behind.
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

    const tokens = await this.issueTokens(user, ctx);
    return {
      ...tokens,
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
  async logout(refreshToken: string | undefined): Promise<void> {
    this.tenantContext.getOrThrow();
    if (!refreshToken) return;
    const tokenHash = this.hashToken(refreshToken);
    await this.tenantPrisma.execute(
      `DELETE FROM refresh_tokens WHERE token_hash = $1`,
      tokenHash,
    );
  }

  // ─── Current user profile ──────────────────────────────────────────────────
  async getMe(user: AuthUser) {
    const rows = await this.tenantPrisma.query(
      `SELECT id, email, first_name, last_name, role, phone, avatar_url,
              last_login_at, created_at
       FROM users WHERE id = $1::uuid AND deleted_at IS NULL`,
      user.userId,
    );
    if (!rows[0]) {
      throw new UnauthorizedException('User no longer exists');
    }
    return rows[0];
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
