import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Role } from '../common/enums/role.enum';
import { PublicPrismaService } from './public-prisma.service';
import { PlatformLoginDto } from './dto/platform-login.dto';

interface DbAdmin {
  id: string;
  email: string;
  password_hash: string;
  is_active: boolean;
}

@Injectable()
export class PlatformAuthService {
  constructor(
    private readonly publicPrisma: PublicPrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: PlatformLoginDto) {
    const rows = await this.publicPrisma.query<DbAdmin>(
      `SELECT id, email, password_hash, is_active
       FROM platform_admins WHERE email = $1`,
      dto.email,
    );
    const admin = rows[0];

    if (!admin || !admin.is_active) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(dto.password, admin.password_hash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.publicPrisma.execute(
      `UPDATE platform_admins SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1::uuid`,
      admin.id,
    );

    const accessToken = await this.jwt.signAsync(
      {
        sub: admin.id,
        email: admin.email,
        role: Role.PLATFORM_ADMIN,
        tenantId: null,
        tenantSlug: null,
      },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: (this.config.get<string>('JWT_ACCESS_EXPIRY') ?? '15m') as JwtSignOptions['expiresIn'],
      },
    );

    return {
      accessToken,
      admin: { id: admin.id, email: admin.email, role: Role.PLATFORM_ADMIN },
    };
  }

  async logout(): Promise<void> {
    // JWTs are short-lived (15m). No server-side blocklist required for now.
    // A Redis blocklist can be added if longer-lived tokens are introduced.
  }
}
