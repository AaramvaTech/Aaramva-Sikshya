/**
 * FILE-1-BLOB — null out inline base64 (`data:`) and '' values in the six
 * image columns (tenants logo/signature/stamp/QR, staff + student photos).
 *
 *   npm run clean-legacy-blobs             # dry-run (default): prints, changes nothing
 *   npm run clean-legacy-blobs -- --apply  # backs up old values to .scratch/, then NULLs
 *
 * Never deletes storage objects. Backups land in apps/api/.scratch/ (git-ignored).
 */
import 'dotenv/config';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { cleanLegacyBlobs } from '../src/modules/storage/legacy-blob-cleanup';

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    console.log(apply ? 'MODE: --apply' : 'MODE: dry-run (pass --apply to write)');
    const { changes, backupPath } = await cleanLegacyBlobs(prisma, {
      apply,
      backupDir: join(__dirname, '..', '.scratch'),
      log: console.log,
    });
    console.log(`${changes.length} value(s) ${apply ? 'cleared' : 'would be cleared'}.`);
    if (backupPath) console.log(`Backup of old values: ${backupPath}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
