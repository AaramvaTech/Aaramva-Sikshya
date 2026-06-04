import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService — the base client, scoped to the PUBLIC schema.
 *
 * Use this for platform-level tables only: tenants, plans, subscriptions.
 * For tenant-scoped data (users, students, ...) use TenantPrismaService,
 * which sets the Postgres search_path to the current tenant's schema.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
