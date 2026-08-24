# Deploy `main` to production

Shipping the billing module to a production that is **26 tables behind**. Written for a
terminal session with no prior context.

| | |
|---|---|
| Host | `ssh ubuntu@82.112.236.82` (key-only, passwordless sudo) |
| App root | `/opt/aaramva` |
| Compose | `docker-compose.prod.yml`, **every command needs `sudo`** (`ubuntu` is not in the `docker` group) |
| DB service | **`postgres`** (not `db`) |
| API image | **`aaramva-api`**, built on the host — no registry, nothing to pull |
| Migrations | 14 public-schema (Prisma) + 38 tenant SQL files, all additive |

`docker compose` will warn `the attribute 'version' is obsolete`. Harmless — ignore it.

---

## One thing to decide before you start

You ruled out a backup because there is no live billing data. That's correct about billing —
but production also holds **`geetanjali-college`: 205 users, 207 students**, three weeks of real
activity, and this deploy recreates containers and runs 38 migrations against it.

The migrations are additive and I have no specific failure in mind. Your call stands and the
sequence below has no backup step. If you want the 20 seconds of insurance anyway:

```bash
sudo docker compose -f /opt/aaramva/docker-compose.prod.yml exec postgres \
  pg_dump -U aaramva_app -Fc aaramva_shikshya > ~/pre-deploy-$(date +%F).dump
```

---

## Step 0 — Get on the box and record what you're rolling back to

```bash
ssh ubuntu@82.112.236.82
cd /opt/aaramva
sudo docker compose -f docker-compose.prod.yml ps
sudo docker images | grep aaramva
git log --oneline -1
```

**Verify:** `api`, `web`, `postgres`, `redis`, `minio` all `Up`. Note the API image ID and the
current commit — these are your rollback targets.

**Now tag the running image, or you cannot roll back.** The build in Step 2 reuses the tag
`aaramva-api`; without this the old image survives only as a dangling ID.

```bash
sudo docker tag aaramva-api aaramva-api:rollback
sudo docker images | grep aaramva-api
```

**Verify:** both `aaramva-api:latest` and `aaramva-api:rollback` listed, same IMAGE ID.

---

## Step 1 — Fetch the new code

```bash
git fetch origin
git log --oneline HEAD..origin/main | wc -l     # how far behind
git checkout main && git pull --ff-only origin main
git log --oneline -1
```

**Verify:** `git status` clean, HEAD is the commit you expect. A merge conflict or a non-ff
error means someone changed files on the server — stop and look before forcing anything.

---

## Step 2 — Build the images

`docker compose up --force-recreate` restarts the **existing image**. It does not rebuild.
That is why production drifted 26 tables behind in the first place. You must build explicitly.

```bash
sudo docker compose -f docker-compose.prod.yml build api web
```

The `web` image bakes `NEXT_PUBLIC_API_URL` in at **build** time as a build-arg. Confirm it is
set in the environment compose reads, or the web bundle ships pointing at nothing:

```bash
grep NEXT_PUBLIC_API_URL /opt/aaramva/.env /opt/aaramva/apps/web/.env.production 2>/dev/null
```

**Verify:** both builds exit 0, and the new image is younger than the old one:

```bash
sudo docker images | grep aaramva
```

Nothing is running the new code yet. The old containers are still up and serving.

---

## Step 3 — Public-schema migrations (Prisma)

Run from a **one-off container off the new image**, not the running one. `prisma` is a
production dependency, so the CLI is present in the runtime image.

```bash
sudo docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy
```

**Verify:** output lists the applied migrations and ends with no error. Then:

```bash
sudo docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate status
```

**Verify:** *"Database schema is up to date!"* — 14 migrations applied.

`migrate deploy` never resets and never prompts. If it reports a failed migration, stop —
do not run `migrate resolve` without reading what actually failed.

---

## Step 4 — Tenant migrations (the 38 SQL files)

**Not `npm run migrate:tenants`** — that runs through `ts-node`, which is a devDependency and
is not in the production image. Use the compiled runner:

### 4a. Look before you write

```bash
sudo docker compose -f docker-compose.prod.yml run --rm api \
  node dist/prisma/migrate-tenants.js --status
```

**Verify:** three tenants listed — `demo`, `geetanjalischoolcollege`, `geetanjali-college` —
each showing its latest applied migration. Expect something well below `0038`.

```bash
sudo docker compose -f docker-compose.prod.yml run --rm api \
  node dist/prisma/migrate-tenants.js --dry-run
```

**Verify:** the pending list per tenant. Writes nothing.

### 4b. Canary on `demo` first

Standing convention in this project: `demo` always goes first, alone.

```bash
sudo docker compose -f docker-compose.prod.yml run --rm api \
  node dist/prisma/migrate-tenants.js --tenant demo
```

**Verify:**

```bash
sudo docker compose -f docker-compose.prod.yml run --rm api \
  node dist/prisma/migrate-tenants.js --status
```

`demo` now reads `0038_fee_structure_class_guard`; the other two are unchanged. Confirm the
billing tables actually exist:

```bash
sudo docker compose -f docker-compose.prod.yml exec postgres \
  psql -U aaramva_app -d aaramva_shikshya -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='tenant_demo';"
```

**Verify:** ~80, up from ~54.

### 4c. Roll to the rest

```bash
sudo docker compose -f docker-compose.prod.yml run --rm api \
  node dist/prisma/migrate-tenants.js
```

**Verify:** `--status` again — all three tenants on `0038`, 0 pending.

> The runner is checksum-guarded and refuses to run if an applied migration's file is missing
> from disk. If it aborts complaining about checksums, you are on the wrong commit — go back
> to Step 1 rather than deleting ledger rows.

The schema is now current while the **old API is still serving**. Additive migrations mean old
code simply ignores the new tables. If you have to stop, this is a safe place to stop.

---

## Step 5 — Swap the containers

```bash
sudo docker compose -f docker-compose.prod.yml up -d --force-recreate api web
```

**Verify:**

```bash
sudo docker compose -f docker-compose.prod.yml ps
sudo docker compose -f docker-compose.prod.yml logs --tail=40 api
```

Look for `Nest application successfully started` and no `env.validation` failure — the app
refuses to boot on a missing `DATABASE_URL` / `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`, and
that fail-fast is deliberate.

Host nginx proxies `127.0.0.1:8010` (api), `:8011` (web), `:8012` (minio). Published ports are
unchanged by a recreate, so **nginx needs no edit**.

---

## Step 6 — Verify the deploy actually shipped

```bash
curl -s http://127.0.0.1:8010/health
```

**Verify:** `"status":"ok"`, `db` up, and **`uptimeSec` in single digits**. An old uptime means
you are looking at a container that never restarted — the exact trap that hid the drift before.

Prove the billing rail is really live (this endpoint 404'd on the old image):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8010/api/v1/finance/cashier/shifts
```

**Verify:** `401` (route exists, auth required) — **not** `404`.

And confirm this deploy's headline fix is in the running code:

```bash
sudo docker compose -f docker-compose.prod.yml exec api \
  grep -c "OWN_BALANCE_SELECT" dist/modules/finance/esewa/esewa.service.js
```

**Verify:** `3`. Zero means an old image is running.

Then in a browser: log into the web app, load a school dashboard, open a student. Watch
`logs -f api` for 30 seconds for anything unexpected.

---

## Rollback

**Read this first: schema cannot be rolled back.** There are no down-migrations; the project's
recovery model is restore-from-backup. That is fine here — **the migrations are additive, so
the old image runs correctly against the new schema.** Roll the *code* back and leave the
schema where it is.

### Code rollback (the normal case)

```bash
cd /opt/aaramva
sudo docker tag aaramva-api:rollback aaramva-api:latest
sudo docker compose -f docker-compose.prod.yml up -d --force-recreate api
sudo docker compose -f docker-compose.prod.yml ps
curl -s http://127.0.0.1:8010/health
```

**Verify:** `status: ok`, fresh `uptimeSec`, and the cashier probe back to `404` — that confirms
you are on the old image.

For `web`, rebuild from the previous commit:

```bash
git checkout <previous-commit>
sudo docker compose -f docker-compose.prod.yml build web
sudo docker compose -f docker-compose.prod.yml up -d --force-recreate web
```

### If a migration fails partway

Each SQL file applies in its own transaction and the ledger records only what completed, so a
failure leaves the tenant at the last good migration, not half-applied. Fix the cause, re-run
`migrate-tenants.js` — already-applied files are skipped by checksum.

Do **not** hand-edit `_tenant_migrations` to make an error go away. Applied files are immutable
by design; editing the ledger turns a loud failure into a silent wrong schema.

### If the database itself is wrong

Only reachable if you took the optional dump in the preamble:

```bash
sudo docker compose -f docker-compose.prod.yml stop api web
cat ~/pre-deploy-<date>.dump | sudo docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U aaramva_app -d aaramva_shikshya --clean --if-exists
sudo docker compose -f docker-compose.prod.yml up -d api web
```

---

## After it's up

- Run `docs/ops/BILLING-CHECKOUT-PROD-CHECK.md` — with the billing rail live for the first
  time, those two queries now have tables to read. Expect zero rows on a schema this fresh.
- The mobile app points at production via its EAS build config, not at anything on this host.
  A new API does not reach existing installs; that needs its own build.

## Known trap, for next time

`up --force-recreate` restarts the existing image. Only `build` produces new code. And check a
running container by `uptimeSec` from `/health`, never by an image or file timestamp — see the
dev note in `CLAUDE.md`.
