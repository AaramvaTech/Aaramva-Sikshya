# Aaramva Shikshya — API image (NestJS + Prisma).
#
# BUILD FROM THE REPO ROOT — the api's compiled output requires
# ../../packages/bs-calendar/dist, so the context must include both packages:
#   docker build -f apps/api/Dockerfile -t aaramva-api .
#
# ── Required env vars at runtime ─────────────────────────────────────────────
# Authority: apps/api/src/config/env.validation.ts (the SEC-1 Joi schema).
# The app REFUSES to boot without these — a missing-env fail-fast is expected:
#   DATABASE_URL         Postgres connection string
#   JWT_ACCESS_SECRET    min 32 chars
#   JWT_REFRESH_SECRET   min 32 chars
# Optional (validated defaults / feature flags): NODE_ENV, PORT (3000),
#   JWT_ACCESS_EXPIRY (15m), JWT_REFRESH_EXPIRY (7d), APP_DOMAIN,
#   ALLOWED_ORIGINS, REDIS_ENABLED + REDIS_URL/REDIS_HOST,
#   SPARROW_SMS_ENABLED + SPARROW_SMS_TOKEN/SPARROW_SMS_SENDER,
#   AWS_BUCKET_NAME, AWS_REGION, ESEWA_SECRET_KEY, KHALTI_SECRET_KEY.
#
# ── Tenant migrations in the deployed image ──────────────────────────────────
# The MIG-1 runner is compiled to dist/prisma/migrate-tenants.js and the SQL
# files live in migrations/tenant/ (copied below). Deployment runs:
#   node dist/prisma/migrate-tenants.js              # all tenants
#   node dist/prisma/migrate-tenants.js --status     # ledger table
#
# node:24-slim (glibc), not alpine: bcrypt is a native dep with reliable
# glibc prebuilds; openssl is installed for the Prisma query engine.

# ── Stage 1: full deps (build tooling included) ──────────────────────────────
FROM node:24-slim AS deps
WORKDIR /app/apps/api
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci

# ── Stage 2: build bs-calendar + generate Prisma client + compile ───────────
FROM node:24-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY packages/bs-calendar packages/bs-calendar
RUN cd packages/bs-calendar && npm ci && npm run build
COPY --from=deps /app/apps/api/node_modules apps/api/node_modules
COPY apps/api apps/api
RUN cd apps/api && npx prisma generate && npm run build

# ── Stage 3: production-only deps ────────────────────────────────────────────
FROM node:24-slim AS proddeps
WORKDIR /app/apps/api
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# ── Stage 4: runtime ─────────────────────────────────────────────────────────
FROM node:24-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=proddeps --chown=node:node /app/apps/api/node_modules apps/api/node_modules
# Generated Prisma client + engine (proddeps installed with --ignore-scripts,
# so the generated client comes from the build stage).
COPY --from=build --chown=node:node /app/apps/api/node_modules/.prisma apps/api/node_modules/.prisma
COPY --from=build --chown=node:node /app/apps/api/node_modules/@prisma/client apps/api/node_modules/@prisma/client
COPY --from=build --chown=node:node /app/apps/api/dist apps/api/dist
# Monorepo-relative runtime require: dist -> ../../packages/bs-calendar/dist
COPY --from=build --chown=node:node /app/packages/bs-calendar/dist packages/bs-calendar/dist
COPY --chown=node:node packages/bs-calendar/package.json packages/bs-calendar/package.json
# Prisma schema (public-schema migrate/introspect) + tenant migration SQL.
COPY --chown=node:node apps/api/prisma apps/api/prisma
COPY --chown=node:node apps/api/migrations apps/api/migrations
USER node
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/main"]
