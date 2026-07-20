# Aaramva Shikshya — web (Next.js admin portal) image.
#
# BUILD FROM apps/web (self-contained: own lockfile, vendored bs-calendar):
#   docker build -t aaramva-web apps/web
#
# Uses `output: 'standalone'` (next.config.ts): the runtime stage carries only
# the traced server bundle + static assets, no node_modules install.
# Runtime env: PORT (default 3000) / HOSTNAME per Next standalone docs.

# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: build ───────────────────────────────────────────────────────────
FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules node_modules
COPY . .
# NEXT_PUBLIC_* vars are inlined into the client JS bundle at `next build` time,
# not read at container runtime — env_file: in docker-compose only reaches the
# runtime stage, and .dockerignore excludes .env* from the build context
# entirely, so this must come in as an explicit build ARG.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
