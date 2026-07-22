#!/usr/bin/env node
// scripts/vendor-bs-calendar.mjs
//
// Vendors packages/bs-calendar into apps/web as a packed npm tarball
// (apps/web/vendor/bs-calendar.tgz). apps/web/package.json depends on it via
// `"bs-calendar": "file:./vendor/bs-calendar.tgz"`.
//
// WHY A TARBALL AND NOT A PLAIN `file:../../packages/bs-calendar` DEPENDENCY:
// apps/web's production Docker build uses `context: apps/web` (see
// apps/web/Dockerfile / docker-compose.prod.yml), NOT the repo root, so
// Docker's COPY can never reach ../../packages/bs-calendar from inside that
// build. Packing the real package into a tarball that lives inside
// apps/web/vendor/ keeps the Docker build context fully self-contained while
// still consuming the actual shared package instead of a hand-maintained
// fork (previously apps/web/lib/bs-calendar/, now deleted).
//
// ── npm-integrity GOTCHA — READ BEFORE EDITING packages/bs-calendar ────────
// apps/web depends on a packed TARBALL, not a directory. `npm ci` inside
// apps/web pins an integrity hash of that tarball's CONTENTS into
// apps/web/package-lock.json. If you change packages/bs-calendar's source,
// you MUST do both of the following, in order:
//   1. Re-run this script (`npm run vendor:bs-calendar` from the repo root,
//      or `node scripts/vendor-bs-calendar.mjs`) to rebuild the package and
//      regenerate apps/web/vendor/bs-calendar.tgz with the new contents.
//   2. Run `npm install` (NOT `npm ci`) inside apps/web to refresh
//      apps/web/package-lock.json's integrity hash against the new tarball.
// Skipping step 2 means the next clean install (`npm ci` inside apps/web,
// including the one Docker's `deps` stage runs) will fail with an npm
// integrity-mismatch error. The tarball filename itself never changes
// (always `bs-calendar.tgz`), so apps/web/package.json's dependency string
// never needs editing when packages/bs-calendar's version bumps — only the
// lockfile's integrity hash does, via step 2.

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve everything relative to this script's own location, not
// process.cwd() — this script is invoked from different working directories
// (root `npm run vendor:bs-calendar`, apps/web's `preinstall` hook via a
// relative path, or directly), and must behave the same in all of them.
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const packagesDir = join(repoRoot, 'packages', 'bs-calendar');
const webVendorDir = join(repoRoot, 'apps', 'web', 'vendor');
const targetTarball = join(webVendorDir, 'bs-calendar.tgz');

if (!existsSync(packagesDir)) {
  // This is the expected situation inside apps/web's Docker `deps` stage:
  // the build context is scoped to apps/web only, so packages/bs-calendar
  // (a sibling directory outside that context) is never reachable from
  // inside the container.
  if (existsSync(targetTarball)) {
    console.log(
      `[vendor-bs-calendar] packages/bs-calendar not found on disk (expected ` +
        `when running inside apps/web's Docker build context) — reusing the ` +
        `pre-vendored tarball at ${targetTarball}.`,
    );
    process.exit(0);
  }

  console.error(
    `[vendor-bs-calendar] ERROR: packages/bs-calendar not found at ${packagesDir}, ` +
      `and no pre-vendored tarball exists at ${targetTarball} either.\n` +
      `Run "node scripts/vendor-bs-calendar.mjs" from a full repo checkout ` +
      `(where packages/bs-calendar is reachable) before building the web ` +
      `Docker image — the Docker build itself cannot regenerate this tarball.`,
  );
  process.exit(1);
}

// Local dev / CI with a full repo checkout: build the real package fresh and
// pack it into apps/web/vendor/.
console.log('[vendor-bs-calendar] Building packages/bs-calendar...');
execSync('npm ci', { cwd: packagesDir, stdio: 'inherit' });
execSync('npm run build', { cwd: packagesDir, stdio: 'inherit' });

mkdirSync(webVendorDir, { recursive: true });

console.log(`[vendor-bs-calendar] Packing tarball into ${webVendorDir}...`);
const packOutput = execSync(
  `npm pack --silent --pack-destination "${webVendorDir}"`,
  { cwd: packagesDir, encoding: 'utf8' },
).trim();

// npm pack prints the generated tarball filename as the last line of stdout
// (e.g. "bs-calendar-1.0.0.tgz"), even with --silent.
const lines = packOutput.split('\n').filter((line) => line.trim().length > 0);
const packedFilename = lines[lines.length - 1]?.trim();
const packedPath = packedFilename ? join(webVendorDir, packedFilename) : undefined;

if (!packedPath || !existsSync(packedPath)) {
  console.error(
    `[vendor-bs-calendar] ERROR: expected "npm pack" to produce a tarball in ` +
      `${webVendorDir}, but it did not. Raw npm pack output was:\n${packOutput}`,
  );
  process.exit(1);
}

// Rename to a fixed filename so apps/web/package.json's dependency string
// ("file:./vendor/bs-calendar.tgz") never needs to change when
// packages/bs-calendar's version bumps.
renameSync(packedPath, targetTarball);

console.log(`[vendor-bs-calendar] Done: ${targetTarball}`);
