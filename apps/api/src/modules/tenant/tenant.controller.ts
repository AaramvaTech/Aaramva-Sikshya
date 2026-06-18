// apps/api/src/modules/tenant/tenant.controller.ts
import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('tenants')
export class TenantController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public endpoint — no auth, no tenant middleware.
   * Returns school name/logo for mobile "school code" screen.
   * Identical 404 for nonexistent, suspended, and deleted schools
   * (prevents slug enumeration revealing platform state).
   */
  @Get('verify/:slug')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verifySlug(@Param('slug') rawSlug: string) {
    const slug = rawSlug.toLowerCase();

    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, isActive: true, deletedAt: null },
      select: { slug: true, name: true, logoUrl: true, address: true, primaryColor: true, primaryForeground: true },
    });

    if (!tenant) {
      throw new NotFoundException('School not found');
    }

    return {
      slug: tenant.slug,
      name: tenant.name,
      logoUrl: tenant.logoUrl ?? null,
      address: tenant.address ?? null,
      primaryColor: tenant.primaryColor ?? null,
      primaryForeground: tenant.primaryForeground ?? null,
    };
  }
}
