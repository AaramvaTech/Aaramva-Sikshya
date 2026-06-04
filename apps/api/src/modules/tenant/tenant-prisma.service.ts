import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from './tenant-context.service';

/** The transaction client type Prisma hands to an interactive $transaction. */
export type TenantTx = Prisma.TransactionClient;

/**
 * TenantPrismaService runs queries against the CURRENT tenant's schema.
 *
 * Tenant tables (users, refresh_tokens, ...) are created via raw SQL and are
 * not Prisma models, so access here is via raw queries. Every call opens a
 * transaction and sets `search_path` to the tenant schema (SET LOCAL, so it is
 * scoped to that transaction's connection) before running the caller's work —
 * which is safe under connection pooling.
 */
@Injectable()
export class TenantPrismaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * Run `fn` with search_path pointed at the current tenant schema.
   * Use the provided `tx` client for all queries inside the callback.
   */
  async run<T>(fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    const { schemaName } = this.tenantContext.getOrThrow();

    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      throw new Error(`Unsafe schema name in context: "${schemaName}"`);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schemaName}", public`);
      return fn(tx);
    });
  }

  /** Convenience: run a single parameterised SELECT in the tenant schema. */
  async query<T = unknown>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.run((tx) =>
      tx.$queryRawUnsafe(sql, ...params) as Promise<T[]>,
    );
  }

  /** Convenience: run a single parameterised write in the tenant schema. */
  async execute(sql: string, ...params: unknown[]): Promise<number> {
    return this.run((tx) => tx.$executeRawUnsafe(sql, ...params));
  }
}
