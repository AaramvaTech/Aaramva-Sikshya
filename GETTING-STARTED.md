# Getting Started — Aaramva Shikshya

Set up the whole project from a fresh clone with **two commands**. Written for
Windows (PowerShell), but the same steps work on macOS/Linux.

By the end you'll have: the API running, the web portal running, and a seeded
**demo school** you can log into.

---

## 1. Prerequisites

Install these first. Nothing else is required — **no Docker needed**.

| Tool | Version | Notes |
|---|---|---|
| **Node.js** | **24 or newer** | every package pins `engines.node >= 24`. Check: `node --version` |
| **PostgreSQL** | **17** (16 also works) | you need a running local server. Check: `psql --version` |
| **Git** | any recent | |
| Redis | *optional* | only for background jobs; the app runs fine without it (`REDIS_ENABLED=false`) |

> Make sure the PostgreSQL `bin` folder is on your `PATH` so `psql` / `createdb`
> work in your terminal (Windows installer option: *"Add to PATH"*, or add
> `C:\Program Files\PostgreSQL\17\bin`).

---

## 2. Clone & install

```powershell
git clone <your-repo-url> aaramva-shikshya
cd aaramva-shikshya
npm run setup
```

`npm run setup` is idempotent (safe to re-run). It:

1. Builds `packages/bs-calendar` → `dist/` — the API and the mobile app both
   import the calendar from its **built** output, which is *not* committed. This
   is the #1 thing that breaks a naive clone; the setup script handles it.
2. Installs `apps/api` deps and generates the Prisma client.
3. Installs `apps/web` deps.
4. Installs `apps/mobile` deps.
5. Creates `apps/api/.env` from `.env.example` (auto-generating the two JWT
   secrets) **if it doesn't already exist**.

---

## 3. Configure your database (`apps/api/.env`)

`npm run setup` created `apps/api/.env` with working JWT secrets already filled
in. **The one value you must edit is `DATABASE_URL`** — point it at your own
local Postgres and create that database once:

```powershell
# 1. create the database (once)
createdb aaramva_shikshya
#   …or:  psql -U postgres -c "CREATE DATABASE aaramva_shikshya;"
```

Then open `apps/api/.env` and set your Postgres password in `DATABASE_URL`:

```env
DATABASE_URL="postgresql://postgres:<your-password>@localhost:5432/aaramva_shikshya?schema=public"
```

Everything else in the file has sensible defaults (`PORT=3001`,
`REDIS_ENABLED=false`). To rotate a JWT secret later:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 4. Bootstrap the database

```powershell
npm run setup:db
```

This runs against the database in your `.env` and:

1. Applies the public-schema migrations (`prisma migrate deploy`).
2. Seeds the subscription plans.
3. Seeds a complete **demo school** and prints its logins.

> Uses `prisma migrate deploy` deliberately — **do not** run `npx prisma migrate
> dev` for setup; that command is interactive and will try to create a stray
> migration on a fresh clone.

### Demo credentials (seeded above)

| Role | Email | Password |
|---|---|---|
| School Owner | `owner@demo.school` | `Owner@12345` |
| Teacher | `teacher@demo.school` | `Teacher@123` |
| Parent | `parent@demo.school` | `Parent@123` |
| Student | `student@demo.school` | `Student@123` |

**School code / tenant slug: `demo`.** On `localhost` there are no subdomains, so
the tenant is passed via the `?tenant=demo` query param (web) or the
`X-Tenant-Slug: demo` header (API/mobile).

---

## 5. Run the apps

Open a terminal per app.

```powershell
# Terminal 1 — API  →  http://localhost:3001
cd apps/api
npm run start:dev
```

```powershell
# Terminal 2 — Web  →  http://localhost:3000
cd apps/web
npm run dev
```

Open **http://localhost:3000**, enter school code **`demo`**, and log in with any
credential above. The Super Admin portal lives at **/super-admin**.

Quick API smoke test (PowerShell):

```powershell
curl.exe http://localhost:3001/health
```

### Mobile app (optional)

```powershell
cd apps/mobile
npm start           # then press a / i, or scan the QR in Expo Go
```

Two mobile-specific notes:

- **LAN IP, not `localhost`.** A phone can't reach `localhost` (that's the phone
  itself). For a physical device, point the app at your laptop's LAN IP and make
  sure both are on the same Wi-Fi. Find it:
  ```powershell
  Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -like 'Wi-Fi*' } | Select-Object IPAddress
  ```
  The API already listens on all interfaces (`0.0.0.0`); allow inbound TCP 3001
  through Windows Firewall the first time.
- **Typed-routes gotcha.** `expo-router` generates route types into the
  gitignored `.expo/types/router.d.ts`. After adding a **new** route file, local
  `tsc` may complain until you regenerate them — start the dev server briefly
  (`npx expo start --offline`) and the types are rebuilt.

---

## 6. Troubleshooting

Seeded from the exact failures a fresh clone hits.

| Symptom | Cause & fix |
|---|---|
| `Cannot find module 'bs-calendar'` (API build, seed, or `expo start`) | `packages/bs-calendar/dist` isn't built. Run `npm run setup` (or, manually: `cd packages/bs-calendar && npm install && npm run build`). |
| `npm run seed:demo` / API fails to boot with a JWT / secret error | A JWT secret is shorter than 32 chars. `npm run setup` auto-generates valid ones; if you hand-edited `.env`, regenerate with the `node -e` command above. |
| `prisma migrate dev` prompts for a migration name / creates a random migration | You ran the wrong command. Use **`npm run setup:db`** (which runs `prisma migrate deploy`). Delete any stray `apps/api/prisma/migrations/<timestamp>/` folder it created. |
| `Can't reach database server` / auth failed | `DATABASE_URL` password/host is wrong, or the database doesn't exist. Fix the password and run `createdb aaramva_shikshya`. |
| `EADDRINUSE :3001` (or `:3000`) | Something already uses that port. Stop it, or change `PORT` in `apps/api/.env` (API) / run `next dev -p <port>` (web). |
| `engines` / Node version warning or a syntax error on start | You're on Node < 24. Install Node 24+ and reinstall (`npm run setup`). |
| Web can't reach the API (CORS / network) | Confirm the API is on `http://localhost:3001` and `ALLOWED_ORIGINS` in `.env` includes `http://localhost:3000`. |

---

## Where to go next

- **Contributing?** Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) (branch naming, PR
  flow, secrets policy, the spec-first workflow).
- **Conventions & architecture:** [`CLAUDE.md`](./CLAUDE.md).
- **Feature specs** live in `docs/api-contracts/` (backend/web) and `docs/mobile/`
  (mobile) — read the relevant one before building a module.
