/**
 * Minimal, standalone S3 helper for seed scripts — mirrors StorageService's
 * env wiring (S3_ENDPOINT/S3_ACCESS_KEY/S3_SECRET_KEY/S3_BUCKET/...) but runs
 * outside Nest DI, since these scripts talk to Postgres directly via
 * PrismaClient rather than bootstrapping the app.
 */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';

export interface SeedStorage {
  bucket: string;
  publicBase: string;
  client: S3Client;
}

export function buildSeedStorage(): SeedStorage {
  const endpoint = process.env.S3_ENDPOINT || '';
  const accessKey = process.env.S3_ACCESS_KEY || '';
  const secretKey = process.env.S3_SECRET_KEY || '';
  const bucket = process.env.S3_BUCKET || '';
  if (!endpoint || !accessKey || !secretKey || !bucket) {
    throw new Error(
      'S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET must all be set (see apps/api/.env) to seed images.',
    );
  }
  const client = new S3Client({
    endpoint,
    region: process.env.S3_REGION || 'us-east-1',
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  const publicBase = (
    process.env.S3_PUBLIC_URL || `${endpoint.replace(/\/+$/, '')}/${bucket}`
  ).replace(/\/+$/, '');
  return { bucket, publicBase, client };
}

export function publicUrlFor(storage: SeedStorage, key: string): string {
  return `${storage.publicBase}/${key}`;
}

/** Uploads one object under the FILE-1 key convention: tenant_<slug>/<kind>/<uuid>.<ext> */
export async function uploadKind(
  storage: SeedStorage,
  slug: string,
  kind: string,
  body: Buffer,
  contentType: string,
  ext: string,
): Promise<string> {
  const key = `tenant_${slug}/${kind}/${randomUUID()}.${ext}`;
  await storage.client.send(
    new PutObjectCommand({ Bucket: storage.bucket, Key: key, Body: body, ContentType: contentType }),
  );
  return key;
}

/** Concurrency-limited batch runner — avoids opening hundreds of sockets at once. */
export async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function runner(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) || 1 }, runner));
  return results;
}
