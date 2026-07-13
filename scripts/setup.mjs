#!/usr/bin/env node
/**
 * scripts/setup.mjs — one-command fresh-clone setup.
 *
 * Windows-first, cross-platform (macOS/Linux too). Idempotent: safe to re-run.
 *
 * Does, in order:
 *   1. Build packages/bs-calendar → dist/   (the API runtime + the mobile app
 *      both import bs-calendar from its built dist/, which is NOT committed).
 *   2. Install apps/api deps (this also generates the Prisma client via the
 *      @prisma/client postinstall) + an explicit `prisma generate` for safety.
 *   3. Install apps/web deps.
 *   4. Install apps/mobile deps.
 *   5. Create apps/api/.env from .env.example if missing (auto-generating the
 *      two JWT secrets) and print exactly what the human still must fill in.
 *
 * After this: edit apps/api/.env → DATABASE_URL, then run `npm run setup:db`.
 * See GETTING-STARTED.md.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = (...p) => join(ROOT, ...p);
const rel = (p) => p.replace(ROOT, '.');

const LINE = '─'.repeat(62);
const step = (m) => console.log(`\n${LINE}\n▶ ${m}\n${LINE}`);
const info = (m) => console.log(`  ${m}`);
const fail = (m) => { console.error(`\n✖ ${m}`); process.exit(1); };

function run(cmd, cwd) {
  info(`$ ${cmd}   (${rel(cwd)})`);
  const r = spawnSync(cmd, { cwd, stdio: 'inherit', shell: true });
  if (r.status !== 0) fail(`Command failed (exit ${r.status}): ${cmd}\n  in ${cwd}`);
}

console.log('Aaramva Shikshya — project setup');
console.log(`Node ${process.version} · ${process.platform}`);

// ── 1. bs-calendar dist ───────────────────────────────────────────────────────
step('1/5  Build bs-calendar (packages/bs-calendar → dist/)');
run('npm install', dir('packages', 'bs-calendar'));
run('npm run build', dir('packages', 'bs-calendar'));
if (!existsSync(dir('packages', 'bs-calendar', 'dist', 'index.js'))) {
  fail('bs-calendar dist/index.js still missing after build.');
}
info('✓ bs-calendar dist built (API runtime + mobile resolve it from here)');

// ── 2. API deps + Prisma client ───────────────────────────────────────────────
step('2/5  Install API deps (apps/api) + generate Prisma client');
run('npm install', dir('apps', 'api'));
run('npm run prisma:generate', dir('apps', 'api')); // explicit + idempotent

// ── 3. Web deps ───────────────────────────────────────────────────────────────
step('3/5  Install Web deps (apps/web)');
run('npm install', dir('apps', 'web'));

// ── 4. Mobile deps ────────────────────────────────────────────────────────────
step('4/5  Install Mobile deps (apps/mobile)');
run('npm install', dir('apps', 'mobile'));

// ── 5. Environment file ───────────────────────────────────────────────────────
step('5/5  Environment file (apps/api/.env)');
const envPath = dir('apps', 'api', '.env');
const examplePath = dir('apps', 'api', '.env.example');
if (existsSync(envPath)) {
  info('✓ apps/api/.env already exists — left untouched.');
} else {
  copyFileSync(examplePath, envPath);
  // Auto-generate the two JWT secrets so the app boots without hand-editing them
  // (Joi rejects secrets shorter than 32 chars on startup).
  let env = readFileSync(envPath, 'utf8');
  const gen = () => randomBytes(48).toString('hex');
  env = env.replace(/JWT_ACCESS_SECRET="[^"]*"/, `JWT_ACCESS_SECRET="${gen()}"`);
  env = env.replace(/JWT_REFRESH_SECRET="[^"]*"/, `JWT_REFRESH_SECRET="${gen()}"`);
  writeFileSync(envPath, env);
  info('✓ Created apps/api/.env from .env.example');
  info('✓ Generated JWT_ACCESS_SECRET + JWT_REFRESH_SECRET (random 48-byte hex)');
  console.log('');
  console.log('  ⚠ ACTION REQUIRED — edit apps/api/.env before `npm run setup:db`:');
  console.log('    • DATABASE_URL: set YOUR local Postgres password and DB name, e.g.');
  console.log('        postgresql://postgres:<your-password>@localhost:5432/aaramva_shikshya?schema=public');
  console.log('      then create that database once:');
  console.log('        createdb aaramva_shikshya        (or:  psql -U postgres -c "CREATE DATABASE aaramva_shikshya;")');
  console.log('    • JWT secrets were auto-generated. To rotate one:');
  console.log('        node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
}

step('Setup complete');
console.log('Next:');
console.log('  1. Make sure apps/api/.env → DATABASE_URL points at a database that exists.');
console.log('  2. npm run setup:db      # migrate + seed plans + seed the demo school (prints logins)');
console.log('  3. Start the apps — see GETTING-STARTED.md.');
