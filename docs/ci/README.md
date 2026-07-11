# CI (CI-1)

## What runs

`.github/workflows/ci.yml` triggers on every `push` and `pull_request`. Four
parallel jobs, each npm-ci'd in its own directory (non-workspace monorepo,
one lockfile per package), all pinned to **Node 24** (matches local dev;
`engines` fields added in CI-1):

| Job | Steps | Notes |
|---|---|---|
| `api` | build bs-calendar → `npm ci` → `npx prisma generate` → `npx tsc -p tsconfig.build.json --noEmit` → `npm test` | Baseline **298 tests**, all service-layer mocks — **no Postgres/Redis containers needed**. `prisma generate` is mandatory: a fresh install has an ungenerated client stub and typecheck fails with ~90 TS2347 errors. Plain `tsc --noEmit` is NOT used — it fails on TS6059 (`test/app.e2e-spec.ts` outside `rootDir`, SEC-1 finding, still unfixed). |
| `web` | `npm ci` → `npx tsc --noEmit` | **No test runner configured (known gap)** — the job logs this explicitly. |
| `mobile` | build bs-calendar → `npm ci` → `npx tsc --noEmit` → `npm test` | jest-expo; tests are timezone-sensitive by design — `TZ=Asia/Kathmandu` is pinned both in the npm script (cross-env) and the job env. |
| `bs-calendar` | `npm ci` → `npm run build` → `npm test` | 26 tests. `dist/` is not committed; api (tsconfig path alias) and mobile (`file:` dep main) both resolve to it, hence the build-first steps above. |

A final **`all-green`** job `needs:` all four — it is the single status check
to require in branch protection. If any job fails, `all-green` is skipped,
which also blocks the merge.

## Pre-push gate (do NOT push until done)

The git history contains the old DB password (see .env). Before the first
push to GitHub:

1. Scrub history with `git filter-repo` (remove the password everywhere).
2. Rotate the local Postgres password.
3. Only then push. The workflow runs automatically on that first push.

## Branch protection (manual, on GitHub, after first push)

1. Settings → Branches → Add branch protection rule for `main`.
2. Enable **Require status checks to pass before merging**, select **all-green**.
3. Enable **Require branches to be up to date before merging**.
4. (Recommended) Require pull-request reviews; disallow force pushes.

## Docker images (CI-1 builds them locally only; no registry/CD yet)

- `apps/api/Dockerfile` — build **from the repo root**:
  `docker build -f apps/api/Dockerfile -t aaramva-api .`
  (root `.dockerignore` filters the context). Runtime: non-root, prod deps +
  `dist/` + `prisma/` + `migrations/tenant/` (the MIG-1 runner is executable
  in-image: `node dist/prisma/migrate-tenants.js`). Required env vars are
  documented in the Dockerfile header; the authority is
  `apps/api/src/config/env.validation.ts` (SEC-1 Joi schema) — a container
  started without them fail-fasts by design.
- `apps/web/Dockerfile` — build from `apps/web`:
  `docker build -t aaramva-web apps/web`
  (Next.js `output: 'standalone'`, enabled in CI-1).
