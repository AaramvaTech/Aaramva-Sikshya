import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantService } from './tenant.service';

/**
 * Tenant schema migration runner (MIG-1).
 *
 * Forward-only, idempotent-preferred, ledger-tracked, canary-first.
 * Plain-SQL migration files live in apps/api/migrations/tenant/ named
 * NNNN_description.sql and reference the tenant schema only via {{schema}}.
 *
 * Per tenant schema the runner: takes a per-schema advisory lock, ensures the
 * schema + ledger table exist, verifies checksums of already-applied migrations
 * (aborting on any mismatch), then applies each pending migration in its OWN
 * transaction, recording a ledger row in the same transaction.
 *
 * There are NO down migrations. A mistake is corrected by a new forward
 * migration; disaster recovery is restore-from-backup.
 *
 * This service uses the direct (public-schema) Prisma connection and sets
 * search_path explicitly — it must NOT depend on the request-scoped tenant
 * context (it runs from a CLI and from provisioning, outside any HTTP request).
 */

/** Advisory-lock namespace (arbitrary constant) to avoid colliding with other
 * pg_advisory locks. Paired with hashtext(schema) as the second key. */
const LOCK_NAMESPACE = 4271;

/** Interactive-transaction bounds — a fresh baseline is ~50 DDL statements. */
const TX_OPTS = { timeout: 120_000, maxWait: 10_000 } as const;

export interface MigrationFile {
  /** File name without the .sql extension, e.g. "0001_baseline". */
  name: string;
  /** sha256 of the raw file contents (tenant-independent). */
  checksum: string;
  /** Raw file contents, still containing the {{schema}} placeholder. */
  sql: string;
}

export interface AppliedRow {
  name: string;
  checksum: string;
}

export type MigrationStatus = 'applied' | 'skipped' | 'pending' | 'failed';

export interface MigrationResult {
  tenant: string;
  migration: string;
  status: MigrationStatus;
  ms: number;
}

export interface TenantRef {
  slug: string;
  schemaName: string;
  createdAt: Date;
}

export interface StatusRow {
  slug: string;
  schemaName: string;
  latest: string | null;
  applied: number;
}

interface MigrateOptions {
  dryRun?: boolean;
  /** Label used in structured log lines (defaults to the schema name). */
  label?: string;
  /** Sink for structured `tenant=… migration=… status=… ms=…` lines. */
  log?: (line: string) => void;
}

/** Thrown when a checksum mismatch or a migration failure aborts the run. */
export class TenantMigrationError extends Error {
  completedTenants: string[] = [];
  failedTenant?: string;
  constructor(message: string) {
    super(message);
    this.name = 'TenantMigrationError';
  }
}

@Injectable()
export class TenantMigrationService {
  private readonly logger = new Logger(TenantMigrationService.name);

  /**
   * Resolves to apps/api/migrations/tenant for both ts-node (src/modules/tenant)
   * and compiled (dist/modules/tenant) — three levels up lands on apps/api in
   * both trees, and the migration files live outside src (not copied to dist).
   */
  private readonly migrationsDir = join(__dirname, '..', '..', '..', 'migrations', 'tenant');

  constructor(private readonly prisma: PrismaService) {}

  // ─── Pure helpers (unit-tested; no DB / no fs) ─────────────────────────────

  static checksum(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /** Order migration files strictly by name (zero-padded NNNN sorts correctly). */
  static orderMigrations(files: MigrationFile[]): MigrationFile[] {
    return [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  /** Ordered files whose names are not yet in the applied set. */
  static computePending(ordered: MigrationFile[], appliedNames: string[]): MigrationFile[] {
    const applied = new Set(appliedNames);
    return ordered.filter((f) => !applied.has(f.name));
  }

  /**
   * Every already-applied migration must still exist on disk with an identical
   * checksum. A tampered or deleted applied migration aborts the whole run —
   * applied migration files are immutable.
   */
  static assertChecksumsMatch(files: MigrationFile[], applied: AppliedRow[]): void {
    const byName = new Map(files.map((f) => [f.name, f]));
    for (const row of applied) {
      const file = byName.get(row.name);
      if (!file) {
        throw new TenantMigrationError(
          `Applied migration "${row.name}" has no file on disk — applied migrations are immutable and must not be removed.`,
        );
      }
      if (file.checksum !== row.checksum) {
        throw new TenantMigrationError(
          `Checksum mismatch for "${row.name}": ledger=${row.checksum} file=${file.checksum}. ` +
            `Applied migrations are immutable; create a new forward migration instead of editing this one.`,
        );
      }
    }
  }

  /**
   * Strip whole-line SQL comments, then split into statements on ';'.
   * Dollar-quote aware: a ';' inside $$ … $$ (or $tag$ … $tag$) does not split,
   * so DO blocks / function bodies stay one statement. Inside an open dollar
   * quote only the matching tag closes it (Postgres semantics). Comment lines
   * inside a dollar-quoted body would still be stripped — keep bodies comment-free.
   */
  static splitStatements(sql: string): string[] {
    const text = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');

    const statements: string[] = [];
    let current = '';
    let openTag: string | null = null;
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (openTag === null && ch === ';') {
        statements.push(current);
        current = '';
        i++;
        continue;
      }
      if (ch === '$') {
        const match = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i));
        if (match && (openTag === null || match[0] === openTag)) {
          openTag = openTag === null ? match[0] : null;
          current += match[0];
          i += match[0].length;
          continue;
        }
      }
      current += ch;
      i++;
    }
    statements.push(current);
    return statements.map((s) => s.trim()).filter((s) => s.length > 0);
  }

  // ─── Loading ───────────────────────────────────────────────────────────────

  /** Read + checksum every NNNN_*.sql migration, ordered by name. */
  loadMigrations(): MigrationFile[] {
    const files = readdirSync(this.migrationsDir)
      .filter((f) => /^\d{4}_.*\.sql$/.test(f))
      .map((f) => {
        const raw = readFileSync(join(this.migrationsDir, f), 'utf8');
        return {
          name: f.replace(/\.sql$/, ''),
          checksum: TenantMigrationService.checksum(raw),
          sql: raw,
        };
      });
    return TenantMigrationService.orderMigrations(files);
  }

  // ─── DB helpers ────────────────────────────────────────────────────────────

  private assertSafeSchema(schema: string): void {
    // Same guard as TenantPrismaService — the schema name is interpolated into DDL.
    if (!/^[a-z0-9_]+$/.test(schema)) {
      throw new TenantMigrationError(`Unsafe schema name: "${schema}"`);
    }
  }

  private async ensureSchemaAndLedger(schema: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // $executeRawUnsafe (not $queryRawUnsafe): pg_advisory_xact_lock returns
      // void, which Prisma cannot deserialize as a query column.
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}, hashtext($1))`,
        schema,
      );
      await tx.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      await tx.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS "${schema}"._tenant_migrations (
           id            serial PRIMARY KEY,
           name          text UNIQUE NOT NULL,
           checksum      text NOT NULL,
           applied_at    timestamptz NOT NULL DEFAULT NOW(),
           execution_ms  int NOT NULL DEFAULT 0
         )`,
      );
    }, TX_OPTS);
  }

  private async ledgerExists(schema: string): Promise<boolean> {
    // ::text — Prisma cannot deserialize the raw regclass OID type.
    const rows = await this.prisma.$queryRawUnsafe<{ oid: string | null }[]>(
      `SELECT to_regclass($1)::text AS oid`,
      `"${schema}"._tenant_migrations`,
    );
    return !!rows[0]?.oid;
  }

  private async readApplied(schema: string): Promise<AppliedRow[]> {
    return this.prisma.$queryRawUnsafe<AppliedRow[]>(
      `SELECT name, checksum FROM "${schema}"._tenant_migrations ORDER BY name`,
    );
  }

  /** Apply one migration in its own transaction; returns applied|skipped + ms. */
  private async applyOne(
    schema: string,
    file: MigrationFile,
  ): Promise<{ status: 'applied' | 'skipped'; ms: number }> {
    const statements = TenantMigrationService.splitStatements(
      file.sql.replace(/\{\{schema\}\}/g, schema),
    );
    const start = Date.now();
    return this.prisma.$transaction(async (tx) => {
      // Per-schema lock: serialises concurrent runs / provisioning against this
      // schema. $executeRawUnsafe because pg_advisory_xact_lock returns void.
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}, hashtext($1))`,
        schema,
      );
      // Re-check under the lock: another runner may have applied it in the gap.
      const already = await tx.$queryRawUnsafe<{ one: number }[]>(
        `SELECT 1 AS one FROM "${schema}"._tenant_migrations WHERE name = $1`,
        file.name,
      );
      if (already.length > 0) {
        return { status: 'skipped' as const, ms: 0 };
      }
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`);
      for (const statement of statements) {
        await tx.$executeRawUnsafe(statement);
      }
      const ms = Date.now() - start;
      await tx.$executeRawUnsafe(
        `INSERT INTO "${schema}"._tenant_migrations (name, checksum, applied_at, execution_ms)
         VALUES ($1, $2, NOW(), $3)`,
        file.name,
        file.checksum,
        ms,
      );
      return { status: 'applied' as const, ms };
    }, TX_OPTS);
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /** All non-deleted tenants (active AND suspended), ordered by creation. */
  async listTenants(): Promise<TenantRef[]> {
    const rows = await this.prisma.tenant.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { slug: true, createdAt: true },
    });
    return rows.map((r) => ({
      slug: r.slug,
      schemaName: TenantService.schemaNameFor(r.slug),
      createdAt: r.createdAt,
    }));
  }

  /**
   * Run every pending migration against a single schema. Used by both the CLI
   * and by provisioning (which passes a freshly-created tenant's schema). On a
   * migration failure the transaction rolls back and a TenantMigrationError is
   * thrown so the caller halts (and, for provisioning, rolls back the schema).
   */
  async migrateSchema(schema: string, opts: MigrateOptions = {}): Promise<MigrationResult[]> {
    this.assertSafeSchema(schema);
    const label = opts.label ?? schema;
    const log = opts.log ?? ((line: string) => this.logger.log(line));
    const dryRun = !!opts.dryRun;

    const files = this.loadMigrations();

    let applied: AppliedRow[] = [];
    if (dryRun) {
      applied = (await this.ledgerExists(schema)) ? await this.readApplied(schema) : [];
    } else {
      await this.ensureSchemaAndLedger(schema);
      applied = await this.readApplied(schema);
    }

    // Checksum verification FIRST — abort the whole run on any mismatch.
    TenantMigrationService.assertChecksumsMatch(files, applied);

    const pending = TenantMigrationService.computePending(
      files,
      applied.map((a) => a.name),
    );

    const results: MigrationResult[] = [];
    for (const file of pending) {
      if (dryRun) {
        results.push({ tenant: label, migration: file.name, status: 'pending', ms: 0 });
        log(`tenant=${label} migration=${file.name} status=pending ms=0`);
        continue;
      }
      try {
        const { status, ms } = await this.applyOne(schema, file);
        results.push({ tenant: label, migration: file.name, status, ms });
        log(`tenant=${label} migration=${file.name} status=${status} ms=${ms}`);
      } catch (err) {
        results.push({ tenant: label, migration: file.name, status: 'failed', ms: 0 });
        log(`tenant=${label} migration=${file.name} status=failed ms=0`);
        const wrapped = new TenantMigrationError(
          `Migration "${file.name}" failed for tenant "${label}": ${(err as Error).message}`,
        );
        wrapped.failedTenant = label;
        throw wrapped;
      }
    }
    return results;
  }

  /**
   * Run migrations across all tenants (or a single --tenant), ordered by
   * created_at. Halts on the first tenant that fails and annotates the error
   * with the tenants already completed.
   */
  async migrateAll(
    opts: MigrateOptions & { tenantSlug?: string } = {},
  ): Promise<{ tenant: string; results: MigrationResult[] }[]> {
    const all = await this.listTenants();
    const targets = opts.tenantSlug
      ? all.filter((t) => t.slug === opts.tenantSlug)
      : all;
    if (opts.tenantSlug && targets.length === 0) {
      throw new TenantMigrationError(`No tenant found with slug "${opts.tenantSlug}"`);
    }

    const summary: { tenant: string; results: MigrationResult[] }[] = [];
    for (const t of targets) {
      try {
        const results = await this.migrateSchema(t.schemaName, {
          dryRun: opts.dryRun,
          label: t.slug,
          log: opts.log,
        });
        summary.push({ tenant: t.slug, results });
      } catch (err) {
        if (err instanceof TenantMigrationError) {
          err.completedTenants = summary.map((s) => s.tenant);
        }
        throw err;
      }
    }
    return summary;
  }

  /** For --status: every tenant with its latest applied migration + count. */
  async status(): Promise<StatusRow[]> {
    const tenants = await this.listTenants();
    const out: StatusRow[] = [];
    for (const t of tenants) {
      let latest: string | null = null;
      let count = 0;
      if (await this.ledgerExists(t.schemaName)) {
        const rows = await this.readApplied(t.schemaName);
        count = rows.length;
        latest = rows.length ? rows[rows.length - 1].name : null;
      }
      out.push({ slug: t.slug, schemaName: t.schemaName, latest, applied: count });
    }
    return out;
  }
}
