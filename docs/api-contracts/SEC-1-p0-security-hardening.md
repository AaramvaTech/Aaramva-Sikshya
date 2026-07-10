# SEC-1 — P0 Backend Security Hardening

**Save location:** `docs/api-contracts/SEC-1-p0-security-hardening.md`
**Scope:** apps/api only. No web, no mobile, no schema changes.
**Source:** docs/audits/FULL-PROJECT-AUDIT-2026-07-07.md, items P0-1, P0-2, P0-5, plus CLAUDE.md secret scrub.

---

## Step 0 — Read and report BEFORE any edits

Read the following and report findings back before writing anything:

1. `apps/api/src/auth/strategies/jwt.strategy.ts` — confirm the `'change-me-access'` fallback and how the secret is read (ConfigService vs process.env).
2. `apps/api/src/app.module.ts` — confirm ThrottlerModule config exists and that **no** `APP_GUARD` provider binds `ThrottlerGuard`.
3. `apps/api/src/main.ts` — confirm whether helmet is present, and what global pipes/interceptors exist.
4. The auth controller (login, refresh, register-school routes) — exact route paths and current decorators.
5. The super-admin impersonation flow — locate where the impersonation access token is signed and what claims it carries. Confirm the audit trail write.
6. How refresh token signing reads its secret (same fallback problem?).
7. `CLAUDE.md` line ~302 — confirm the committed database password.

Report: file paths, line numbers, and any deviation from the above assumptions. **Stop and flag if reality differs materially from this spec.**

---

## Task 1 — Fail-fast on missing JWT secrets

- Remove every fallback default (`'change-me-access'` and any refresh-token equivalent).
- Add config validation at bootstrap so the app **refuses to start** if `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` is missing or shorter than 32 chars.
  - Preferred: `ConfigModule.forRoot({ validationSchema })` with Joi (add `joi` if not present), covering at minimum: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`. Mark Redis/SMS vars optional (Redis is legitimately off in dev).
  - If Joi is undesirable, an explicit throw in a config factory is acceptable — but validation schema is preferred so future vars slot in.
- Update `.env.example` accordingly with a comment on minimum secret length.

## Task 2 — Enforce rate limiting

- Bind `ThrottlerGuard` globally via `APP_GUARD` in `app.module.ts`.
- Sensible global default (e.g. 100 req / 60s per IP) — confirm existing ThrottlerModule config and keep it if reasonable.
- Strict per-route overrides with `@Throttle`:
  - `POST /auth/login` → 5 / 60s
  - `POST /auth/refresh` → 10 / 60s
  - SMS send endpoint(s) in Communication module → 10 / 60s
  - `POST /register-school` (public tenant provisioning) → **3 / 3600s** — this endpoint creates a Postgres schema per call and is the worst abuse vector.
- Exempt `/health` if/when it exists (`@SkipThrottle` — fine to add the decorator pre-emptively).
- Nepal deployment note: schools share NAT'd IPs. Per-IP limits on *login* may hit legitimate bursts (whole staff logging in at 9:55am). 5/min per IP is still correct for now — note it in code comments as a known tuning point, do not engineer per-user throttling in this session.

## Task 3 — helmet + security headers

- `pnpm add helmet` (or npm — match the repo's package manager exactly).
- `app.use(helmet())` in `main.ts`. Disable `contentSecurityPolicy` only if it breaks the report-card PDF or logo endpoints — test those two after enabling, and report the outcome either way.

## Task 4 — Impersonation claim

- When super-admin impersonates a school owner, the signed access token must include:
  - `imp: true`
  - `imp_by: <super-admin user id>`
- Extend the JWT payload type/interface so `imp`/`imp_by` are typed optional fields.
- The existing audit-trail write stays as-is. Do **not** add behavioral restrictions on impersonated tokens in this session — the claim just needs to exist so logs and future guards can distinguish them.
- Verify normal (non-impersonation) tokens do NOT carry the claim.

## Task 5 — Scrub committed DB password

- Replace the real password in `CLAUDE.md` with `<DB_PASSWORD — see .env>`.
- Confirm `.env` is in `.gitignore` (report, don't assume).
- Add a note at the end of the session report: **rotation of the actual Postgres password and git-history scrub (git filter-repo / BFG) must be done manually by Srijan — list the exact commands but do not run them.**

---

## Verification — required before session close

All proofs must be **raw terminal output pasted verbatim**, not summaries.

1. `npx tsc --noEmit` — raw output.
2. Full test suite — raw output including final test count (baseline is 251+ passing; must not decrease).
3. **Fail-fast proof:** unset `JWT_ACCESS_SECRET`, attempt to boot, paste the startup error. Restore and show clean boot.
4. **Throttle proof (live HTTP):** script 6 consecutive `POST /auth/login` attempts with bad credentials against the running dev server; paste output showing the 6th returns `429`. Same for 4 rapid `register-school` calls (use a throwaway slug pattern; do NOT actually let a 4th schema get created — the 429 must arrive first, and clean up any test schemas created by the first 3 with a `DROP SCHEMA` + a `SELECT` read-back proving they're gone).
5. **Helmet proof:** `curl -sI` any endpoint; paste headers showing `X-Content-Type-Options`, `X-Frame-Options` (or CSP) present.
6. **Impersonation proof:** perform a live impersonation via the super-admin flow, decode the returned JWT (`node -e` with base64 decode is fine), paste the payload showing `imp: true, imp_by: <id>`. Then decode a normal login token showing the claim absent.
7. Report-card PDF endpoint still returns a valid PDF after helmet (live call, show status + content-type header).

## Out of scope (do not touch)

- Web RBAC / middleware.ts → SEC-2
- Mobile timezone bug → FIX-1
- Tenant migration runner → MIG-1
- /health, Sentry, logging → OPS-1
