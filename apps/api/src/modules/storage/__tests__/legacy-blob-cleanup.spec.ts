import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { cleanLegacyBlobs, schemaFor, type Db } from '../legacy-blob-cleanup';

/** Fake DB: one tenant with a data: signature, an '' stamp and a data: staff photo. */
function fakeDb() {
  const state = {
    sig: 'data:image/png;base64,AAAA' as string | null,
    stamp: '' as string | null,
    photo: 'data:image/jpeg;base64,BBBB' as string | null,
  };
  const executed: string[] = [];
  const hit = (v: string | null) => (v !== null && (v.startsWith('data:') || v === '') ? [{ id: 'row-1', v }] : []);
  const db: Db = {
    async $executeRawUnsafe(sql: string) {
      executed.push(sql);
      if (sql.includes('"principalSignatureUrl"')) state.sig = null;
      if (sql.includes('"schoolStampUrl"')) state.stamp = null;
      if (sql.includes('staff_profiles')) state.photo = null;
      return 1;
    },
    async $queryRawUnsafe(sql: string) {
      if (sql.includes('FROM public.tenants ORDER')) return [{ id: 't-1', slug: 'motherland-school' }] as never;
      if (sql.includes('information_schema.schemata'))
        return [{ schema_name: 'tenant_motherland_school' }, { schema_name: 'tenant_bill_scratch' }] as never;
      if (sql.includes('"principalSignatureUrl" AS v')) return hit(state.sig) as never;
      if (sql.includes('"schoolStampUrl" AS v')) return hit(state.stamp) as never;
      if (sql.includes('staff_profiles')) return hit(state.photo) as never;
      return [] as never;
    },
  };
  return { db, state, executed };
}

describe('cleanLegacyBlobs (FILE-1-BLOB)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'blobs-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('schemaFor maps hyphens to underscores', () => {
    expect(schemaFor('motherland-school')).toBe('tenant_motherland_school');
  });

  it('dry-run reports every hit but writes nothing (no UPDATE, no backup file)', async () => {
    const { db, state, executed } = fakeDb();
    const r = await cleanLegacyBlobs(db, { apply: false, backupDir: dir });
    expect(r.changes).toHaveLength(3);
    expect(executed).toHaveLength(0);
    expect(r.backupPath).toBeNull();
    expect(readdirSync(dir)).toHaveLength(0);
    expect(state.sig).not.toBeNull();
  });

  it('skips schemas with no public.tenants row (tenant_bill_scratch)', async () => {
    const { db } = fakeDb();
    const r = await cleanLegacyBlobs(db, { apply: false, backupDir: dir });
    expect(r.skippedSchemas).toEqual(['tenant_bill_scratch']);
  });

  it('--apply backs up old values first, NULLs them, and a second run changes nothing', async () => {
    const { db, state } = fakeDb();
    const first = await cleanLegacyBlobs(db, { apply: true, backupDir: dir });
    expect(first.changes).toHaveLength(3);
    expect(existsSync(first.backupPath!)).toBe(true);
    const backup = JSON.parse(readFileSync(first.backupPath!, 'utf8')) as { oldValue: string }[];
    expect(backup.map((b) => b.oldValue).sort()).toEqual(['', 'data:image/jpeg;base64,BBBB', 'data:image/png;base64,AAAA']);
    expect([state.sig, state.stamp, state.photo]).toEqual([null, null, null]);

    const second = await cleanLegacyBlobs(db, { apply: true, backupDir: dir });
    expect(second.changes).toHaveLength(0);
    expect(second.backupPath).toBeNull();
  });
});
