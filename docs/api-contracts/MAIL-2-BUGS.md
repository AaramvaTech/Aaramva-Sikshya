# MAIL-2 — Bug & Findings Log

Findings for MAIL-2 (Real Email Transport for Credential Delivery). Same convention as
`REG-1-BUGS.md`: real bugs get a full row; design/spec conflicts and deferrals are recorded
as `MAIL-OBS-*` entries and surfaced at the owning checkpoint. Proof standards per spec §5
(raw output, live HTTP + SELECT read-backs for anything touching the poller/DB).

Baseline at branch point (from `origin/main`, REG-1 merged via PR #15): **API 594 tests**,
web vitest **15**, mobile jest **112**. MAIL-2 Phase 1 is **API-only** (web/mobile untouched).

---

## Phase 1 — Discovery report (MAIL-1 internals) — REQUIRED BEFORE CODE (spec §2)

**Conclusion: MAIL-1 already uses nodemailer with a full SMTP config. MAIL-2 EXTENDS it
cleanly — no parallel mailer, no restructuring. Proceeding with Phase 1 (not stopping).**

### What was found

`apps/api/src/modules/mail/` (MAIL-1):

- **`MailService`** (`mail.service.ts`) — the single send interface, already nodemailer-based:
  - `import * as nodemailer` + `nodemailer.createTransport(...)`. Dep already present:
    `nodemailer ^9.0.1` + `@types/nodemailer ^8.0.1` in `apps/api/package.json` (spec's
    "add if absent" ⇒ **already present**, nothing to add).
  - A **three-way `mode` getter**: `'smtp' | 'ethereal' | 'disabled'`, resolved from env:
    `SMTP_HOST` set → `smtp`; else `MAIL_ETHEREAL=true` → `ethereal` (nodemailer test inbox
    with logged preview URLs); else `disabled` (MOCK).
  - `onModuleInit()` already logs an OPS-1-style **boot notice** of the active mode.
  - SMTP transporter built from `SMTP_HOST`, `SMTP_PORT` (def 587), `SMTP_SECURE` (def false),
    `SMTP_USER`/`SMTP_PASS` (auth omitted when user unset).
  - From address/name from **`MAIL_FROM`** + `MAIL_FROM_NAME` (def "Aaramva Shikshya").
  - `send(input): Promise<SendMailResult>` — best-effort: **always** writes an `email_log` row
    (PUBLIC schema), delivers, updates status `SENT|FAILED|MOCK`; **never throws** to the caller.
    Redaction invariant already holds: only `recipient` + `subject` + `type` are persisted/logged;
    **bodies never** touch `email_log` or logs.
- **`CredentialMailer`** (`credential-mailer.service.ts`) — HTML/text templates
  (new-credentials / reset / reset-link / login-email-changed), calls `MailService.send`.
- **`MailListener`** (`mail.listener.ts`) — consumes `MAIL_EVENTS` fire-and-forget.
- Config: SMTP_* / MAIL_* vars are **already registered in the SEC-1 Joi schema**
  (`src/config/env.validation.ts`), all optional (absent ⇒ disabled/MOCK).
- The **REG-1 delivery poller** (`modules/credential-delivery/`) calls `MailService.send` for
  the EMAIL channel and maps `res.status === 'FAILED'` → its internal `'RETRY'` signal. SMS is
  handled by the poller directly (in-memory Sparrow POST; `SMS_DRY_RUN=true` ⇒ `SENT_DRY`).

### How MAIL-2 extends it (no restructure)

1. **Transport abstraction via `MAIL_TRANSPORT=MOCK|SMTP`** layered *on top of* the existing
   `mode` getter as an explicit override — **backward compatible**:
   - `MAIL_TRANSPORT=SMTP` → `smtp` (fail-fast validated at boot).
   - `MAIL_TRANSPORT=MOCK` → `disabled` (never sends; ignores SMTP_HOST/ETHEREAL).
   - **unset** → the *existing* resolution (SMTP_HOST → smtp; MAIL_ETHEREAL → ethereal; else
     disabled). Preserves every current dev/CI setup and every existing MailService test verbatim.
   - Satisfies spec "default MOCK": with nothing configured (CI), effective transport is mock;
     and "assert `MAIL_TRANSPORT` is MOCK/**unset**" (§2) confirms unset is an allowed CI state.
2. **Fail-fast at boot** (`onModuleInit`): when `MAIL_TRANSPORT=SMTP`, require `SMTP_HOST`,
   `SMTP_USER`, `SMTP_PASS`, and a from-address; any missing → **throw** (no silent mock
   fallback — the BUG-1 lesson). Legacy `SMTP_HOST`-alone (no `MAIL_TRANSPORT`) keeps its
   permissive behavior (some relays need no auth) — not weakened, not the new guarantee.
3. **`MAIL_FROM_ADDRESS`** (spec §2 name) added and **preferred**, falling back to the existing
   `MAIL_FROM` (back-compat). See MAIL-OBS-1.
4. **Classifier is channel-generic and lives on the poller**, not the sender. To let the
   classifier see the SMTP error for the EMAIL channel, `SendMailResult` gains an optional
   `error?: string` (populated only on the transport-failure branch), and `deliverEmail`
   **throws** that error on `FAILED` (previously it silently returned `RETRY` with a null
   `last_error`) so it flows through the poller's `try/catch` → `last_error` → classifier. This
   is strictly an improvement (email failures now record `last_error`) and touches no existing
   test (no existing test exercises the email-FAILED return path — the retry/FAILED tests use a
   decrypt error, which still routes to the normal branch).

### MAIL-OBS-1 — `MAIL_FROM` vs `MAIL_FROM_ADDRESS` naming reconciliation

Spec §2 lists the from-address var as **`MAIL_FROM_ADDRESS`**; MAIL-1 code + Joi use
**`MAIL_FROM`**. Resolved by supporting **both**: `MAIL_FROM_ADDRESS` is added to the Joi
schema and read first; `MAIL_FROM` remains a fallback. No breakage for existing `.env`.

---

## Phase 1 — Implementation log

### Files changed

Tracked (modified):
- `apps/api/src/config/env.validation.ts` — `MAIL_TRANSPORT` (valid MOCK|SMTP, **not** defaulted)
  + `MAIL_FROM_ADDRESS` added to the Joi schema.
- `apps/api/src/modules/mail/mail.service.ts` — transport override in `mode`, boot fail-fast +
  boot log, `fromAddress()` (MAIL_FROM_ADDRESS → MAIL_FROM), `SendMailResult.error`.
- `apps/api/src/modules/credential-delivery/credential-delivery.service.ts` — classifier branch,
  `retry_holds` in the SELECT/`DeliveryRow`, `DrainTally.held`, `deliverEmail` throws on FAILED.
- Test specs: `mail.service.spec.ts` (+6), `credential-delivery.service.spec.ts` (+3).
- `docs/api-contracts/REG-1-BUGS.md` — §8 gate split (REG-G-EMAIL / REG-G-SMS).

New (untracked):
- `apps/api/migrations/tenant/0014_credential_delivery_retry_holds.sql`
- `apps/api/src/modules/credential-delivery/retry-classifier.util.ts` (+ spec, +6 tests)
- `docs/api-contracts/MAIL-2-BUGS.md` (this file)

### Design decisions (as built)

- **Transport selector layered as an override** (see discovery above): `MAIL_TRANSPORT=SMTP`→smtp
  (boot-validated), `=MOCK`→disabled, **unset**→legacy resolution. Zero existing MailService tests
  changed. Ethereal dev mode preserved (reachable only when unset + `MAIL_ETHEREAL=true`).
- **Fail-fast** (`MailService.assertSmtpConfigured`, called from `onModuleInit` only when
  `MAIL_TRANSPORT=SMTP`): missing `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`/from-address → throws (aborts
  boot). Port/secure/from-name keep safe defaults. Legacy `SMTP_HOST`-alone stays permissive.
- **Boot log line** every boot: `Mail transport ACTIVE: SMTP|ETHEREAL|MOCK (…)`.
- **Classifier is channel-generic** (`retry-classifier.util.ts`, lives on the poller side, not
  the sender): `isRateLimitError` matches SMTP 421/450/451, HTTP 429, and quota/rate-limit/throttle
  text. For the EMAIL channel the SMTP error reaches the classifier via the new
  `SendMailResult.error` + `deliverEmail` throwing on FAILED (previously it swallowed the error and
  left `last_error` null — now populated, strictly an improvement). SMS already threw
  `Sparrow SMS failed: HTTP <code>`, so the future real-SMS path inherits the classifier unchanged.
- **RETRYABLE_NO_ATTEMPT**: a rate-limit hit reschedules (`rateLimitBackoffSeconds`: 1→10 min,
  capped) and bumps `retry_holds` **without** touching `attempts`; status stays PENDING. Cap
  `MAX_RETRY_HOLDS=50` → FAILED with `last_error='retry hold cap exceeded'`. All other errors keep
  the existing attempts++/3→FAILED behavior. New tally field `held` (partial `toMatchObject`
  assertions in existing tests are unaffected).

### Migration 0014 — applied canary → all (LIVE)

`retry_holds INT NOT NULL DEFAULT 0`, idempotent. **LF-verified** (sha256 `32bdf62c18ed122f…`) so
the byte-checksum is machine-independent (CRLF hazard avoided).

- **Canary (`--tenant demo`)**: `status=applied ms=85`; read-back — column `integer NOT NULL
  default 0`; ledger row `0014_…` checksum16 `32bdf62c18ed122f`.
- **All tenants (`migrate:tenants`)**: 5 more applied (stacey-mejia, kaye-nashh, motherland-school,
  raja-mcintyres, jorden-donovan) + demo already had it → `6 tenants | applied=5`.
- **Read-back (psql, all 6 schemas)**: `retry_holds` present on all 6
  (`integer NOT NULL default 0`); ledger = **6 rows, 1 distinct checksum** (`32bdf62c18ed122f`).

> **Runner env note (infra, not a code issue):** `npm run migrate:tenants` boots the full AppModule
> via `ts-node`; a cold, full type-check on Windows is very slow, and piping its output through
> PowerShell `Select-Object -Last N` buffers until the process exits (a lingering handle delays that)
> — so the first attempts looked hung. Running with `TS_NODE_TRANSPILE_ONLY=1` (type-check already
> green via `tsc -p tsconfig.build.json`) and **without** the `Select-Object` pipe streamed output
> normally and applied cleanly. MinIO was down during the run; harmless (`StorageService` probes it
> fire-and-forget, only warns).

### Verification (Checkpoint 1 floors)

| Check | Result |
|---|---|
| API tests | **610 passed / 78 suites** (595 REG-1 baseline + 15 MAIL-2: classifier 6, mail 6, poller 3). ≥ 595 ✅ |
| Redaction re-run | `staff.service.spec` `'REG-1 §3: never writes the generated temp password to any log output'` → **PASS**. My new mail-error surfacing + poller rate-limit `warn` log never carry the plaintext (only recipient/subject/type, row id, channel, error text, hold count). ✅ |
| API typecheck | `tsc -p tsconfig.build.json --noEmit` → **exit 0**. (Bare `tsc` shows only pre-existing TS6059 rootDir noise for `scripts/`+`test/`, not touched here.) ✅ |
| Web / mobile | **Untouched** — zero changes under `apps/web` / `apps/mobile` (diff is API + docs only), so web vitest **15** / mobile jest **112** hold by construction. ✅ |
| Classifier unit proofs | 429 → HELD, **no attempt burned**, `retry_holds` bumped, still PENDING; hold cap 50 → FAILED `'retry hold cap exceeded'`; non-rate-limit email FAILED → normal retry (attempts++). ✅ |
| Fail-fast unit proof | `MAIL_TRANSPORT=SMTP` + missing vars → `onModuleInit` throws; fully configured (via `MAIL_FROM_ADDRESS`) → no throw. ✅ |

### Deferred to Phase 2 (needs Srijan)

- Live SMTP proof with `MAIL_TRANSPORT=SMTP` + Brevo creds (real inbox receipt) — the acceptance
  bar for **REG-G-EMAIL**, which closes at **Checkpoint 2** (recorded in REG-1-BUGS).
- Live classifier proof (real 429 or a forced 429 stub) — Phase 2.
- `MAIL-G-DOMAIN` (SPF/DKIM/DMARC + domain from-address) — blocked on domain purchase, OPS-adjacent.

**⏹ STOP — Checkpoint 1.** Phase 1 code complete, migration applied + read-back on all 6 tenants,
floors cleared, redaction re-run green. Awaiting review before Phase 2 (live SMTP).

---

## Phase 2 — Live SMTP proof (Brevo)

### MAIL-2-OBS-1 (Phase 2) — Brevo `525 5.7.1 Unauthorized IP address` on the first real send

The first real SMTP drain to Brevo (`MAIL_TRANSPORT=SMTP`, `smtp-relay.brevo.com`) **failed**:
`credential_deliveries.last_error` and `email_log.error` both recorded
`Invalid login: 525 5.7.1 Unauthorized IP address`, `email_log.status=FAILED`,
`provider_message_id` empty. Root cause was **account-side, not code**: Brevo's *Authorised IPs*
restriction did not include the dev machine's public sending IP.

Two things this incidentally proved:
- **The transport is genuinely SMTP, not MOCK.** The send reached Brevo and got a real 525; a MOCK
  send records `email_log.status=MOCK` and never contacts a provider. (Satisfies the §5 standard —
  no mocked-only claim for transport behavior.)
- **The classifier is correct.** `525` is not in the rate-limit set (421/450/451/429/quota/throttle),
  so the row took the **normal retry** path (`attempts 0→1`, `retry_holds` unchanged at 0, status
  stayed PENDING with backoff) — NOT a hold. A stale rotated SMTP key would surface as an auth
  failure too, but this is specifically an IP-authorisation rejection *after* login negotiation.

**Resolution:** Srijan authorised the sending IP in Brevo (Account → Security → Authorised IPs).
No server restart required (account-side allowlist). The EMAIL row remained PENDING (2 attempts
left) and was re-drained after authorisation. Recipient email + the exact IP are deliberately
kept out of this doc.

### MAIL-2-OBS-2 (Phase 2) — the outbox credential email was too bare (no school name / code / URL) → ENRICHED

On confirming the first real receipt, the email carried only username + temp password — **no
school name, no school code (the tenant slug the mobile app's first screen asks for), no login URL,
no mobile instructions**. MAIL-1's `CredentialMailer` template already had all of these; the REG-1
**outbox** path (`CredentialDeliveryService`) never adopted them. A recipient — especially on
mobile — literally cannot log in without the school code.

**Fix (folded into MAIL-2 at Srijan's direction; §1 "no template redesign" waived for this):**
enriched `deliverEmail` — school **name** + **code** + web **login URL** + **mobile instructions**
+ an **account-type label** (staff / student / parent / school owner); guardian-routed rows still
name the student. Resolved via `TenantContextService` (slug) + `PublicPrismaService` (name) +
`APP_DOMAIN`. Redaction invariant intact (temp password stays in-memory, HTML-escaped, never
logged/persisted); redaction test re-run green. Unit tests added (self + guardian assert school
code / URL / account type).

**Re-proven live:** resend → drain → EMAIL **SENT** (new Brevo `provider_message_id`) → Srijan
confirmed the inbox now shows the school code + account type + login URL.

### MAIL-2-OBS-3 (Phase 2) — HR staff WEB form bypasses credential email → SEPARATE follow-up PR

Surfaced while testing: an admin created a staff member from the HR panel and **no credentials
email was sent**. Root cause is **not** transport or the poller — it's the web form.
`app/(school)/hr/staff/page.tsx` has a **required Password field** and sends `password` to
`POST /hr/staff`. The backend generates a temp password + enqueues credential delivery **only when
no password is supplied**; with a password present it just creates the account. Proven on
`tenant_motherland_school`: 2 newly-created users with `must_change_password = f`, **0**
`credential_deliveries` rows, **0** `email_log` attempts.

REG-OBS-5 dropped the onboard-school form's password field but **the HR staff form was missed**
(student/guardian forms are unaffected — they send no password). **Secondary:**
`CREDENTIAL_DELIVERY_POLL=false` disables the auto-drain, so even a correctly-enqueued delivery
won't send in dev without the poller enabled (prod: `true`/unset → drains every 60s) or a manual
`POST /credential-deliveries/run`.

**Disposition (Srijan's call): SEPARATE follow-up PR** — drop the password field (match REG-OBS-5),
stop sending `password`, add a "temp password will be emailed" note, verify enqueue+drain sends the
email. **Not in MAIL-2 scope** (MAIL-2 is API transport + the OBS-2 template).

### Checkpoint 2 — MAIL-2 code-complete; REG-G-EMAIL CLOSED

Live email proofs (recipient email + IP redacted): register test staff (no password) → ledger
EMAIL + SMS **PENDING** → drain → SMS **SENT_DRY**, EMAIL **SENT** with a real Brevo
`provider_message_id` (`email_log` never `MOCK` — genuinely SMTP) → **Srijan confirmed real inbox
receipt** of the enriched email → login with the delivered temp password + forced-change
(`must_change_password` cleared, sessions revoked) → soft-delete the test user + ledger read-back
(append-only audit trail retained). Classifier: forced-429 stub — a 429 **holds** the row (no
attempt burned, `retry_holds → 1`), then it **drains to SENT** on the next run.

Suites: **612 API / 15 web / 112 mobile**, `tsc -p tsconfig.build.json` clean. Test staff (demo)
soft-deleted; all probe data cleaned. **REG-G-EMAIL → CLOSED** (recorded in REG-1-BUGS).
