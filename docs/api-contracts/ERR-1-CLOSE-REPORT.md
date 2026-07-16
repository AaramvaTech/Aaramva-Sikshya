# ERR-1 — Close Report

**Branch:** `feat/err-1-error-handling` → PR to `main` (Srijan merges; Claude Code never merges).
**Outcome:** one error contract end-to-end; every user-facing error path in API, web, and mobile
routes through it. The original symptom — a wrong login showing **"no refresh token available"** —
is fixed and re-proven on the final branch.

---

## 1. What shipped, by phase

| Phase | Commit | Summary |
|---|---|---|
| 0 — Inventory | `9c5ade1` | `ERR-1-INVENTORY.md` (error-surface map) + `ERR-1-BUGS.md` (ERR-1-BUG-1 reproduced live). |
| 1 — API envelope + filter + catalog | `d04e891` | `error-codes.ts` catalog (single source of truth), global `HttpExceptionFilter` (semantic codes, Prisma `P2002`/`P2025` map, `requestId` from `X-Request-Id`, prod/dev leak rules), `ValidationPipe` → **422** `details.fields`, throw-site sweep. |
| 2 — Interceptors + BUG-1 | `3c11e54` | web + mobile axios interceptors exclude the 4 auth endpoints (§1.3 rule 1), single-flight refresh, session-expiry notice; login shows **"Invalid email or password."** |
| 3 — Web sweep | `9d6368b` | `lib/errors.ts` `getErrorDisplay`, QueryCache global `onError`, `extractApiErrors` 422 `details.fields`, `FORBIDDEN_SCOPE` server message alignment, closure (5 hardcoded onError fixed). |
| 4 — Mobile sweep | `ed2cf2c` | `lib/errors.ts` (same contract, network/offline first-class + `userMessage` carve-out), query `retry` classifier, sweep of login/change-password/assignment-detail/marks. |
| 5 — Regression + close | (this) | full suite, leak-probe re-run, `ERR-1-BUGS.md` final status, this report. |

---

## 2. The error contract (as shipped — Checkpoint-0 amendment)

Nested envelope **kept** (not flattened); `code` is a semantic catalog value; `requestId` added inside `error`:

```json
{ "success": false, "error": { "code": "AUTH_INVALID_CREDENTIALS", "message": "Invalid email or password.", "details": null, "requestId": "…" } }
```

- **Catalog:** `apps/api/src/modules/common/errors/error-codes.ts` — the one source of truth.
- **Filter:** `HttpException` → mapped; Prisma `P2002`→`CONFLICT_DUPLICATE`(409), `P2025`→`RESOURCE_NOT_FOUND`(404), else 500 (raw Prisma text → logs/Sentry only); class-validator → `VALIDATION_FAILED`(422) `details.fields`; unhandled → `INTERNAL_ERROR`(500) + `requestId`, **no stack/query/`_debug` in production**.
- **Clients:** `getErrorDisplay(error)` (`apps/web/lib/errors.ts`, `apps/mobile/lib/errors.ts`) → `{ kind, message, fields?, requestId?, retryable }`, keyed by `code`; **raw `error.message` is never rendered**.

---

## 3. Final-branch proof (Phase 5 live re-run, prod mode)

All five ERR-1 leak probes re-passed against the final branch (temporary dev route used for the
P2002 + forced-throw checks, then removed):

```
1  wrong login        → 401 {"code":"AUTH_INVALID_CREDENTIALS","message":"Invalid email or password.", …}
2  Prisma P2002       → 409 {"code":"CONFLICT_DUPLICATE", …}    leak grep: prisma 0 · SELECT 0 · slug 0 · constraint 0 · stack 0
3  forced throw       → 500 {"code":"INTERNAL_ERROR","message":"… Ref: f49210af-…"}   body _debug/stack: 0
                         log line reqId == body.requestId (f49210af-…, status 500)
4  invalid payload    → 422 {"code":"VALIDATION_FAILED","details":{"fields":{"token":"…","newPassword":"…"}}}
5  cross-family IDOR   → 403 {"code":"FORBIDDEN_SCOPE","message":"You don't have access to this record."}
```

Probe 5's message is the Phase-3-aligned catalog default (confirms §F item 8 landed). The
authorization model (403 on scope probes) is unchanged — ERR-1 only standardized bodies.

---

## 4. Regression (final branch)

```
API      Test Suites: 80 passed, 80 total   Tests: 640 passed, 640 total
Web      Test Files    4 passed (4)          Tests:  27 passed (27)
Mobile   Test Suites: 14 passed, 14 total    Tests: 129 passed, 129 total
```

796 tests, 0 failures. API baseline pre-ERR-1 was **621** (≥ the spec's 511 floor) and never dropped;
ERR-1 added semantic-filter, catalog, validation, and client `getErrorDisplay` tests (+19 api, +12
web-vitest incl. api-errors, +17 mobile).

---

## 5. Acceptance greps

- **Web** raw `err.message`/`error.message` in render paths: **0** (before + after; pages always read the `.error.message` envelope property).
- **Mobile** raw `err.message`/`error.message`/`${err}` in render/Alert paths: **5 → 0** (remaining 3 hits are 2 comments + 1 dev-only `console.log`).

---

## 6. Left as documented / out of scope

- Bespoke web envelope extractors (8 sites) read the server `.error.message` — **safe** (no raw leak); converting them to `extractApiErrors` for `details.fields` surfacing is incremental.
- Payment-gateway (`esewa`/`khalti`) throws default-mapped; explicit `PAYMENT_VERIFICATION_FAILED` codes are a small follow-up (`ERR-1-INVENTORY §E`).
- Error-copy i18n (Nepali) — `getErrorDisplay` returns English; the `kind`/`code` structure makes a later `code→t()` pass trivial (I18N-2, out of scope per CLAUDE.md).
- `fee-structures dueDate` cast bug stays on the PAY-1 backlog (spec §3).

---

## 7. Srijan-verification (manual — no browser/device automation in this environment)

1. **Web offline:** stop the API, load a data page → offline `ErrorState` + working "Try again".
2. **Mobile airplane-mode** (EAS preview APK): login + a data screen → offline message (`"Can't reach the server…"`) + retry. Network class is code-proven (web vitest + mobile jest matrices); on-device UX is yours to confirm.

---

## 8. Merge

- Branch pushed: `feat/err-1-error-handling` (Phases 0–5).
- **CI:** could not be polled from this environment (no `gh` CLI / token). Local reproduction of every CI job is green (api typecheck+640, web tsc+vitest, mobile tsc+jest). Please confirm the Actions run before merge.
- **Claude Code does not merge PRs** (standing rule) — open the PR and merge at your discretion.
