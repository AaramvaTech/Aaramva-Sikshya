#!/usr/bin/env node
// apps/web/scripts/preinstall.mjs
//
// Thin shim run as apps/web's `preinstall` npm lifecycle script. It exists
// because apps/web's Docker build context is scoped to apps/web only — a
// `preinstall` command referencing the real vendoring script at
// ../../scripts/vendor-bs-calendar.mjs (repo-root-relative) would try to
// `require`/load a path that doesn't exist inside that scoped build context
// at all (see the previous commit's blocker: `RUN npm ci` in the Docker
// `deps` stage crashed with MODULE_NOT_FOUND before any of the real script's
// own graceful fallback logic could run).
//
// This shim file itself always lives at apps/web/scripts/preinstall.mjs, so
// it is guaranteed to be present in BOTH contexts (a full local checkout,
// and the Docker deps stage, which COPYs apps/web/scripts/ in alongside
// apps/web/vendor/) — only the file it delegates to may or may not exist.
//
// NOTE: this file intentionally does NOT use `--ignore-scripts` on the
// Docker `RUN npm ci` line as a workaround. apps/web's dependency tree
// includes packages with real install-lifecycle scripts (sharp fetches its
// native binary via an `install` script; msw and unrs-resolver both have
// `postinstall` scripts) — ignoring all lifecycle scripts would silently
// skip those too, a worse and quieter failure mode than the one this shim
// fixes.

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
// apps/web/scripts/ -> apps/web/ -> apps/ -> <repo-root>/ -> scripts/vendor-bs-calendar.mjs
const realVendorScript = resolve(__dirname, '../../../scripts/vendor-bs-calendar.mjs');

if (existsSync(realVendorScript)) {
  // Full repo checkout (local dev / CI): delegate to the real vendoring
  // script, which builds packages/bs-calendar fresh and packs it into
  // apps/web/vendor/bs-calendar.tgz. Let failures propagate loudly — a real
  // build failure in packages/bs-calendar must fail the install, not be
  // swallowed here.
  execSync(`node "${realVendorScript}"`, { stdio: 'inherit' });
} else {
  // Expected inside apps/web's Docker build context: packages/bs-calendar
  // (and the scripts/ directory that vendors it) live outside this scoped
  // context and were never COPY'd in. We rely on apps/web/vendor/bs-calendar.tgz
  // having already been pre-vendored and COPY'd in (see apps/web/Dockerfile).
  // Deliberately not re-implementing a tarball-existence check here: if it's
  // genuinely missing, npm's own dependency resolution (which runs right
  // after this preinstall step) will fail on its own with a clear
  // "no such file" error pointing at file:./vendor/bs-calendar.tgz — that's
  // already a clear enough signal.
  console.log(
    `[preinstall] vendor script not reachable at ${realVendorScript} — assuming a scoped ` +
      `Docker build context; relying on a pre-vendored apps/web/vendor/bs-calendar.tgz already present.`,
  );
  process.exit(0);
}
