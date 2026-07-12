/**
 * FILE-1 T3 — orphaned-object pruner (manual, no cron).
 *
 * An orphan is an object in the storage bucket that NO database row references:
 * it was presign-uploaded but the confirm step (student update, settings save,
 * document add, …) never happened. Referenced keys live in:
 *   - <tenant schema>.students.photo_url            (student-photo)
 *   - <tenant schema>.staff_profiles.photo_url      (staff-photo)
 *   - <tenant schema>.staff_documents.file_url      (staff-document)
 *   - public.tenants."principalSignatureUrl"/"schoolStampUrl" (keys)
 *   - public.tenants."logoUrl"                      (PUBLIC URL — key extracted
 *     by stripping the S3_PUBLIC_URL / {endpoint}/{bucket} prefix)
 *
 * DRY-RUN is the DEFAULT — nothing is deleted unless --delete is passed.
 * Objects newer than --grace-hours (default 24) are always kept: they may be
 * in-flight uploads whose confirm has not landed yet.
 *
 * Usage (from apps/api, reads .env):
 *   npx ts-node scripts/prune-orphans.ts               # dry-run report
 *   npx ts-node scripts/prune-orphans.ts --delete      # actually delete
 *   npx ts-node scripts/prune-orphans.ts --grace-hours 48
 */
import 'dotenv/config';
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';

const DELETE = process.argv.includes('--delete');
const graceIdx = process.argv.indexOf('--grace-hours');
const GRACE_HOURS = graceIdx >= 0 ? Number(process.argv[graceIdx + 1]) : 24;

function env(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name} — storage is not configured; nothing to prune.`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const endpoint = env('S3_ENDPOINT');
  const bucket = env('S3_BUCKET');
  const client = new S3Client({
    endpoint,
    region: process.env.S3_REGION || 'us-east-1',
    credentials: {
      accessKeyId: env('S3_ACCESS_KEY'),
      secretAccessKey: env('S3_SECRET_KEY'),
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  });
  const publicBase = (
    process.env.S3_PUBLIC_URL || `${endpoint.replace(/\/+$/, '')}/${bucket}`
  ).replace(/\/+$/, '');

  const prisma = new PrismaClient();

  // ── 1. Every key the database references ─────────────────────────────────
  const referenced = new Set<string>();

  const schemas = await prisma.$queryRawUnsafe<{ schema_name: string }[]>(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%'`,
  );
  for (const { schema_name } of schemas) {
    const rows = await prisma.$queryRawUnsafe<{ v: string | null }[]>(
      `SELECT photo_url AS v FROM "${schema_name}".students WHERE photo_url IS NOT NULL
       UNION ALL
       SELECT photo_url FROM "${schema_name}".staff_profiles WHERE photo_url IS NOT NULL
       UNION ALL
       SELECT file_url FROM "${schema_name}".staff_documents WHERE file_url IS NOT NULL`,
    );
    for (const { v } of rows) if (v) referenced.add(v);
  }

  const tenantRows = await prisma.$queryRawUnsafe<
    { logo: string | null; sig: string | null; stamp: string | null }[]
  >(
    `SELECT "logoUrl" AS logo, "principalSignatureUrl" AS sig, "schoolStampUrl" AS stamp
     FROM public.tenants`,
  );
  for (const r of tenantRows) {
    if (r.sig) referenced.add(r.sig);
    if (r.stamp) referenced.add(r.stamp);
    // logos are stored as public URLs — strip the base to recover the key
    if (r.logo?.startsWith(`${publicBase}/`)) {
      referenced.add(r.logo.slice(publicBase.length + 1));
    }
  }

  // ── 2. Every object in the bucket ────────────────────────────────────────
  const graceCutoff = Date.now() - GRACE_HOURS * 3600 * 1000;
  const orphans: { key: string; size: number; lastModified: Date }[] = [];
  let totalObjects = 0;
  let inGrace = 0;
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
    );
    for (const obj of page.Contents ?? []) {
      if (!obj.Key) continue;
      totalObjects++;
      if (referenced.has(obj.Key)) continue;
      const modified = obj.LastModified ?? new Date(0);
      if (modified.getTime() > graceCutoff) {
        inGrace++;
        continue;
      }
      orphans.push({ key: obj.Key, size: obj.Size ?? 0, lastModified: modified });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  // ── 3. Report / delete ───────────────────────────────────────────────────
  console.log(
    `${totalObjects} objects in bucket "${bucket}" | ${referenced.size} referenced keys in DB | ` +
      `${inGrace} unreferenced but within the ${GRACE_HOURS}h grace window | ${orphans.length} orphan(s)`,
  );
  for (const o of orphans) {
    console.log(`  ORPHAN ${o.key} (${o.size} bytes, last modified ${o.lastModified.toISOString()})`);
  }

  if (!DELETE) {
    console.log(orphans.length ? '\nDry-run — nothing deleted. Re-run with --delete to remove them.' : '\nNothing to prune.');
  } else {
    for (const o of orphans) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: o.key }));
      console.log(`  deleted ${o.key}`);
    }
    console.log(`\nDeleted ${orphans.length} orphan(s).`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
