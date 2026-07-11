# CI-1 — Continuous Integration Pipeline + Dockerfiles

**Save location:** `docs/api-contracts/CI-1-ci-pipeline.md`
**Scope:** repo root + apps/api + apps/web. Creates .github/workflows, Dockerfiles, .dockerignore. No feature code changes.
**HARD PREREQUISITE (manual, Srijan):** the git-history password scrub (`git filter-repo` removing <REDACTED>) and DB password rotation MUST be complete before this repo is pushed to GitHub. The session builds everything locally; the first push is a separate, gated step.
**Baseline:** 298 tests (api). Mobile has jest-expo tests (TZ-pinned). bs-calendar has 13 tests. Web has NO test runner (tsc only).

---

## Step 0 — Read and report

1. Confirm `.github/` does not exist. Report the current branch and whether a `main` branch exists — all work to date is on `feat/mobile-design-parity`; report `git branch -a`.
2. Per app (`apps/api`, `apps/web`, `apps/mobile`, `packages/bs-calendar`): the package manager in use (lockfile type), Node version expectations (engines field, .nvmrc, or none), and the exact commands for typecheck + tests. Known quirks to verify: api's plain `tsc --noEmit` fails on the test/-outside-rootDir issue (SEC-1 finding) — report whether that was ever fixed and which tsc invocation is clean; mobile tests need `TZ` pinned; bs-calendar is consumed three different ways (audit item 21) — report how, but do NOT restructure the monorepo in this session.
3. Whether Docker Desktop is currently available (`docker version`) — determines if image builds can be verified live.
4. What the api needs at *runtime* vs *test time*: confirm the 298 tests are mocked service-layer tests needing no live Postgres/Redis (expected), so CI needs no service containers.

## T1 — GitHub Actions workflow

`.github/workflows/ci.yml`, triggered on `push` and `pull_request` to all branches:

- **Four parallel jobs:** `api`, `web`, `mobile`, `bs-calendar`. Each: checkout → setup-node (pin the version Step 0 found; if none found, pin the version Srijan runs locally — `node --version` — and add it to engines) → cache keyed on the app's lockfile → install with the lockfile-respecting command (`npm ci` or equivalent) → typecheck → tests.
  - api: the clean tsc invocation from Step 0 + full jest suite (assert on exit code; the 298 count is informational in logs).
  - web: `tsc --noEmit` only; add an explicit log line "no test runner configured (known gap)".
  - mobile: jest-expo with `TZ=Asia/Kathmandu` in the job env (the tests are timezone-sensitive by design).
  - bs-calendar: its 13 tests.
- A final `all-green` job that `needs:` all four — the single required status check for future branch protection.
- If any job needs >10 min, report; do not silently accept slow CI.

## T2 — Dockerfiles

- `apps/api/Dockerfile`: multi-stage (deps → build → runtime). Runtime stage: non-root user, only production deps + dist + the `migrations/tenant/` directory (the runner must be executable in the deployed image — deployment will run migrations), `NODE_ENV=production`. Document the required env vars in a comment block (the Joi schema from SEC-1 is the authority — reference it).
- `apps/web/Dockerfile`: multi-stage Next.js build (standalone output if the config supports it; enable it if trivial, report if not).
- `.dockerignore` per app: node_modules, .env*, backups/, .expo, test files.
- **Verification:** if Docker Desktop is available (Step 0 item 3 — ask Srijan to start it), `docker build` both images and paste the final image sizes + a container smoke-run of the api image (it should fail-fast with the Joi missing-env error — that IS the success proof, demonstrating SEC-1's gate works in the image). If Docker is unavailable, mark both builds UNVERIFIED prominently in the close report.

## T3 — Hygiene riders

- Backfill CLAUDE.md dev-notes: MIG-3 + the dollar-quote-aware splitter (carried over from MIG-3's close).
- Add a `docs/ci/README.md`: what CI runs, the pre-push gate (history scrub), and the branch-protection setup steps to perform manually on GitHub after first push (protect `main`, require `all-green`).

## Verification — raw output

1. Run every CI job's exact command sequence locally (fresh install where feasible) — paste each job's final status lines. Local parity is the proof available pre-push; the workflow's first real run happens after Srijan's gated push.
2. Docker proofs per T2 (or UNVERIFIED marker).
3. Full api suite ≥298 unchanged; `git status` clean after commits.
4. Commits: `ci: GitHub Actions pipeline (CI-1)`, `build: Dockerfiles for api and web`, docs/hygiene separate.

## Out of scope
- Actually pushing to GitHub (gated on the manual scrub).
- Monorepo workspace restructuring (audit item 21) — a future session.
- CD/deployment configs, staging environments (post-OPS-1).
- Web test runner introduction.
