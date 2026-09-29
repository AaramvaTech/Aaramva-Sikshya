import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * FILE-1-BLOB cleanup core (thin CLI: scripts/clean-legacy-blobs.ts).
 *
 * Finds inline `data:` values and '' (cleared-by-old-web) in the six image
 * columns and sets them to NULL. Never touches storage objects, never touches
 * a schema that has no public.tenants row (e.g. tenant_bill_scratch).
 * Idempotent: a second --apply matches nothing.
 */
export interface Db {
  $queryRawUnsafe<T = unknown>(sql: string, ...args: unknown[]): Promise<T>;
  $executeRawUnsafe(sql: string, ...args: unknown[]): Promise<number>;
}

export interface Change {
  tenant: string;
  table: string;
  column: string;
  id: string;
  oldLength: number;
  oldValue: string;
}

const HIT = (col: string) => `(${col} LIKE 'data:%' OR ${col} = '')`;
const TENANT_COLS = ['logoUrl', 'principalSignatureUrl', 'schoolStampUrl', 'qrImageUrl'];
const PHOTO_TARGETS = [['students', 'photo_url'], ['staff_profiles', 'photo_url']] as const;

/** Tenant slug → schema name (hyphens become underscores). */
export const schemaFor = (slug: string) => `tenant_${slug.replace(/-/g, '_')}`;

export async function cleanLegacyBlobs(
  db: Db,
  opts: { apply: boolean; backupDir: string; log?: (l: string) => void },
): Promise<{ changes: Change[]; skippedSchemas: string[]; backupPath: string | null }> {
  const log = opts.log ?? (() => undefined);
  const tenants = await db.$queryRawUnsafe<{ id: string; slug: string }[]>(
    `SELECT id, slug FROM public.tenants ORDER BY slug`,
  );
  const known = new Set(tenants.map((t) => schemaFor(t.slug)));
  const allSchemas = await db.$queryRawUnsafe<{ schema_name: string }[]>(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant\_%'`,
  );
  const skippedSchemas = allSchemas.map((s) => s.schema_name).filter((s) => !known.has(s));
  for (const s of skippedSchemas) log(`SKIPPED schema ${s} (no public.tenants row)`);

  const changes: Change[] = [];
  const push = (tenant: string, table: string, column: string, r: { id: string; v: string }) =>
    changes.push({ tenant, table, column, id: r.id, oldLength: r.v.length, oldValue: r.v });

  for (const t of tenants) {
    for (const col of TENANT_COLS) {
      const rows = await db.$queryRawUnsafe<{ id: string; v: string }[]>(
        `SELECT id::text AS id, "${col}" AS v FROM public.tenants WHERE id = $1 AND ${HIT(`"${col}"`)}`,
        t.id,
      );
      rows.forEach((r) => push(t.slug, 'public.tenants', col, r));
    }
    const schema = schemaFor(t.slug);
    for (const [table, col] of PHOTO_TARGETS) {
      const rows = await db.$queryRawUnsafe<{ id: string; v: string }[]>(
        `SELECT id::text AS id, ${col} AS v FROM "${schema}".${table} WHERE ${HIT(col)}`,
      );
      rows.forEach((r) => push(t.slug, `${schema}.${table}`, col, r));
    }
  }

  for (const c of changes) log(`${opts.apply ? 'CLEAR' : 'WOULD CLEAR'} ${c.tenant} | ${c.table}.${c.column} | old length ${c.oldLength}`);

  let backupPath: string | null = null;
  if (opts.apply && changes.length > 0) {
    // Backup FIRST — nulling a base64 blob is unrecoverable otherwise.
    mkdirSync(opts.backupDir, { recursive: true });
    backupPath = join(opts.backupDir, `legacy-blobs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    writeFileSync(backupPath, JSON.stringify(changes, null, 2));
    for (const c of changes) {
      const isTenants = c.table === 'public.tenants';
      const target = isTenants ? c.table : c.table.replace(/^([^.]+)\./, '"$1".');
      const col = isTenants ? `"${c.column}"` : c.column;
      await db.$executeRawUnsafe(
        `UPDATE ${target} SET ${col} = NULL WHERE id::text = $1 AND ${HIT(col)}`,
        c.id,
      );
    }
  }
  return { changes, skippedSchemas, backupPath };
}
