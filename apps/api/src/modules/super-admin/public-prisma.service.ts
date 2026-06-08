import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * PublicPrismaService — always queries the PUBLIC schema.
 * Use this for all super-admin operations (platform_admins, plans, tenants, etc.).
 * Never use TenantPrismaService in super-admin code.
 */
@Injectable()
export class PublicPrismaService {
  constructor(private readonly prisma: PrismaService) {}

  async query<T = unknown>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL search_path TO public');
      return tx.$queryRawUnsafe(sql, ...params) as Promise<T[]>;
    });
  }

  async execute(sql: string, ...params: unknown[]): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL search_path TO public');
      return tx.$executeRawUnsafe(sql, ...params);
    });
  }
}
