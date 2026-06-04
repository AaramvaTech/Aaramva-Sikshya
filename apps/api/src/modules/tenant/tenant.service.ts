import { Injectable, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from './tenant-context.service';

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  /** A slug is lowercase alphanumeric + hyphens, 3–30 chars. */
  static isValidSlug(slug: string): boolean {
    return /^[a-z0-9-]{3,30}$/.test(slug);
  }

  /** Convert a tenant slug into its Postgres schema name. */
  static schemaNameFor(slug: string): string {
    return `tenant_${slug}`;
  }

  /**
   * Resolve a tenant by slug from the PUBLIC schema. Throws 404 if the school
   * does not exist, is inactive, or has been soft-deleted.
   */
  async resolveBySlug(slug: string): Promise<TenantContext> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, isActive: true, deletedAt: null },
      select: { id: true, slug: true },
    });

    if (!tenant) {
      throw new NotFoundException(`School "${slug}" not found`);
    }

    return {
      tenantId: tenant.id,
      slug: tenant.slug,
      schemaName: TenantService.schemaNameFor(tenant.slug),
    };
  }

  /**
   * Create the tenant's Postgres schema (tenant_<slug>) and its tables by
   * running tenant-schema.sql. All statements run inside one transaction so a
   * partial failure rolls back cleanly.
   */
  async provisionSchema(slug: string): Promise<void> {
    if (!TenantService.isValidSlug(slug)) {
      throw new Error(`Refusing to provision schema for invalid slug: "${slug}"`);
    }
    const schemaName = TenantService.schemaNameFor(slug);

    // Defence-in-depth: the schema name must be a plain identifier before we
    // ever interpolate it into DDL.
    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      throw new Error(`Unsafe schema name: "${schemaName}"`);
    }

    const template = readFileSync(join(__dirname, 'tenant-schema.sql'), 'utf-8');
    const sql = template.replace(/:schema/g, schemaName);

    // Strip whole-line SQL comments first, THEN split into statements — so a
    // comment sitting above a statement does not swallow the statement itself.
    const statements = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    await this.prisma.$transaction(async (tx) => {
      for (const statement of statements) {
        await tx.$executeRawUnsafe(statement);
      }
    });
  }
}
