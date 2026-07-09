import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import {
  TenantMigrationError,
  TenantMigrationService,
} from '../modules/tenant/tenant-migration.service';

/**
 * Tenant schema migration CLI (MIG-1). Matches the seed convention:
 * a plain ts-node script that boots a Nest application context.
 *
 *   npm run migrate:tenants                     # all tenants, ordered by created_at
 *   npm run migrate:tenants -- --tenant demo    # single tenant (canary)
 *   npm run migrate:tenants -- --dry-run        # per-tenant pending list, no writes
 *   npm run migrate:tenants -- --status         # table of tenant × latest applied
 */

/* eslint-disable no-console */

function parseArgs(argv: string[]) {
  const out: { tenant?: string; dryRun: boolean; status: boolean } = {
    dryRun: false,
    status: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--status') out.status = true;
    else if (a === '--tenant') out.tenant = argv[++i];
    else if (a.startsWith('--tenant=')) out.tenant = a.slice('--tenant='.length);
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const runner = app.get(TenantMigrationService);

  try {
    if (args.status) {
      const rows = await runner.status();
      console.log('\nTenant migration status');
      console.log('─'.repeat(72));
      console.log(
        'slug'.padEnd(24) + 'latest_applied'.padEnd(28) + 'count'.padEnd(8) + 'schema',
      );
      console.log('─'.repeat(72));
      for (const r of rows) {
        console.log(
          r.slug.padEnd(24) +
            String(r.latest ?? '(none)').padEnd(28) +
            String(r.applied).padEnd(8) +
            r.schemaName,
        );
      }
      console.log('─'.repeat(72));
      console.log(`${rows.length} tenants\n`);
      return;
    }

    const mode = args.dryRun ? 'DRY-RUN (no writes)' : 'APPLY';
    const scope = args.tenant ? `tenant=${args.tenant}` : 'all tenants';
    console.log(`\nmigrate:tenants — ${mode} — ${scope}\n`);

    const summary = await runner.migrateAll({
      dryRun: args.dryRun,
      tenantSlug: args.tenant,
      log: (line) => console.log(line),
    });

    let applied = 0;
    let skipped = 0;
    let pending = 0;
    for (const t of summary) {
      for (const r of t.results) {
        if (r.status === 'applied') applied++;
        else if (r.status === 'skipped') skipped++;
        else if (r.status === 'pending') pending++;
      }
    }
    console.log(
      `\nDone — ${summary.length} tenants | applied=${applied} skipped=${skipped} pending=${pending}\n`,
    );
  } catch (err) {
    if (err instanceof TenantMigrationError) {
      console.error(`\nABORTED: ${err.message}`);
      if (err.completedTenants.length) {
        console.error(`Tenants already migrated this run: ${err.completedTenants.join(', ')}`);
      }
      if (err.failedTenant) {
        console.error(`Failed on tenant: ${err.failedTenant}`);
      }
    } else {
      console.error('\nUnexpected error:', err);
    }
    await app.close();
    process.exit(1);
  }

  await app.close();
}

main().catch((err) => {
  console.error('migrate:tenants failed to start:', err);
  process.exit(1);
});
