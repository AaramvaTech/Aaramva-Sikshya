#!/usr/bin/env node
/**
 * scripts/setup-db.mjs — bootstrap the developer's OWN local database.
 *
 * Runs, in order, against the DATABASE_URL in apps/api/.env:
 *   1. prisma migrate deploy   — apply the committed public-schema migrations
 *      (deploy, NOT `migrate dev`: non-interactive, applies only committed
 *      migrations, never prompts, never fabricates a drift migration).
 *   2. npm run seed            — subscription plans (Basic / Pro / Enterprise).
 *   3. npm run seed:demo       — the "demo" tenant + a full demo school, and
 *      prints the demo login credentials.
 *
 * Works on a completely EMPTY database. Idempotent: safe to re-run.
 * Prerequisite: `npm run setup` (deps + bs-calendar dist + apps/api/.env).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = join(ROOT, 'apps', 'api');

const LINE = '─'.repeat(62);
const step = (m) => console.log(`\n${LINE}\n▶ ${m}\n${LINE}`);
const fail = (m) => { console.error(`\n✖ ${m}`); process.exit(1); };

function run(cmd) {
  console.log(`  $ ${cmd}`);
  const r = spawnSync(cmd, { cwd: API, stdio: 'inherit', shell: true });
  if (r.status !== 0) fail(`Command failed (exit ${r.status}): ${cmd}`);
}

// ── Prerequisite checks (fail early, with the exact fix) ──────────────────────
if (!existsSync(join(API, '.env'))) {
  fail('apps/api/.env is missing — run `npm run setup` first, then edit DATABASE_URL.');
}
if (!existsSync(join(ROOT, 'packages', 'bs-calendar', 'dist', 'index.js'))) {
  fail('packages/bs-calendar/dist is missing — run `npm run setup` first.');
}
if (!existsSync(join(API, 'node_modules'))) {
  fail('apps/api/node_modules is missing — run `npm run setup` first.');
}

console.log('Aaramva Shikshya — database bootstrap');

step('1/3  Apply public-schema migrations (prisma migrate deploy)');
run('npx prisma migrate deploy');

step('2/3  Seed subscription plans');
run('npm run seed');

step('3/3  Seed the demo school (tenant + demo logins)');
run('npm run seed:demo'); // prints the credential block

step('Database ready');
console.log('The demo school is seeded. Log in with the credentials printed above.');
console.log('  School code (slug): demo');
console.log('  Owner   : owner@demo.school   / Owner@12345');
console.log('  Teacher : teacher@demo.school / Teacher@123');
console.log('  Parent  : parent@demo.school  / Parent@123');
console.log('  Student : student@demo.school / Student@123');
console.log('');
console.log('Start the apps — see GETTING-STARTED.md.');
