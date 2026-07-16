# ERR-1 — Bug Tracker

Tracks every user-facing error defect found during ERR-1 and its final status.
Created in Phase 0. Status values: `OPEN` → `FIXED (phase N)` → `VERIFIED (phase 5)`. `OUT-OF-SCOPE` for items parked on another gate/backlog.

| ID | Summary | Status | Fix phase |
|---|---|---|---|
| ERR-1-BUG-1 | Wrong login credentials do not show "Invalid email or password"; interceptor runs its refresh flow on the login-401 and surfaces an internal outcome (mobile: literal "No refresh token available"; web: silent page reload). | **VERIFIED (Phase 5)** | Phase 2 (client) |
| ERR-1-CONTRACT-1 | Validation responses changed **400 + `message[]` → 422 + `details.fields`** — a client-facing contract change (Checkpoint-0 amendment 2). | **VERIFIED (Phase 5)** | Phase 3 (web) / Phase 4 (mobile) |

---

## ERR-1-BUG-1 — Login error is swallowed by the refresh interceptor

**Reported by:** ERR-1 spec §0. **Reproduced:** Phase 0, live, against running dev stack (API `:3001`, web `:3000`, Postgres `:5432`, tenant `demo`).

### Root cause
Both axios interceptors treat **every** HTTP 401 as a session-expiry — including 401s from `/auth/login`. On a wrong-password attempt the interceptor fires the refresh flow instead of letting the login screen show the server's message:
- **Mobile** (`apps/mobile/lib/api.ts:141–142`): no refresh token in SecureStore (fresh login) → `throw new Error('No refresh token available')` → rendered verbatim by `app/login.tsx:96–102`. **← exact spec symptom.**
- **Web** (`apps/web/lib/api.ts:42–66`): fires `POST /auth/refresh` (→401) → `catch{}` → `logout()` + `window.location.href='/login'` → full page reload; the login toast is wiped/flashed. Intended message never persists.

The server behaves correctly and returns a clean, safe message — the defect is entirely client-side.

### Raw evidence

**STEP A — wrong-password login (web-style, no `X-Client-Type`):**
```
$ curl -s -i -X POST http://localhost:3001/api/v1/auth/login \
    -H "Content-Type: application/json" -H "X-Tenant-Slug: demo" \
    -d '{"email":"nobody@example.com","password":"wrongpassword"}'

HTTP/1.1 401 Unauthorized
X-Request-Id: 3b86e783-02e7-4bf6-89bd-4ec355455be9
Content-Type: application/json; charset=utf-8
Content-Length: 96
...
{"success":false,"error":{"code":"UNAUTHORIZED","message":"Invalid credentials","details":null}}
```

**STEP B — the chained `/auth/refresh` the web interceptor fires (no cookie):**
```
$ curl -s -i -X POST http://localhost:3001/api/v1/auth/refresh \
    -H "Content-Type: application/json" -H "X-Tenant-Slug: demo" -d '{}'

HTTP/1.1 401 Unauthorized
X-Request-Id: a978489a-8e18-4dfb-9f8e-3a234d465040
...
{"success":false,"error":{"code":"UNAUTHORIZED","message":"No refresh token provided","details":null}}
```

**STEP C — same login, mobile-style (`X-Client-Type: mobile`) → identical server body:**
```
$ curl -s -X POST http://localhost:3001/api/v1/auth/login \
    -H "Content-Type: application/json" -H "X-Tenant-Slug: demo" \
    -H "X-Client-Type: mobile" \
    -d '{"email":"nobody@example.com","password":"wrongpassword"}' -w "\nHTTP_STATUS=%{http_code}\n"

{"success":false,"error":{"code":"UNAUTHORIZED","message":"Invalid credentials","details":null}}
HTTP_STATUS=401
```

**Proof the symptom string is client-manufactured (never in any server body):**
```
$ curl -s ... (mobile login above) | grep -c "No refresh token available"
0
```

### Displayed string (client render)
| Client | Server sent | User actually sees | Source |
|---|---|---|---|
| Mobile | `Invalid credentials` (401) | **"No refresh token available"** (red error box) | `apps/mobile/lib/api.ts:142` string → `app/login.tsx:96–102` renders `err.message` verbatim (no `': '` → shown as-is) — deterministic from code path |
| Web | `Invalid credentials` (401) | **No persistent message — form reloads** (`sonner` toast flashes then is wiped by `window.location.href='/login'`) | `apps/web/lib/api.ts:60–66` forced redirect on refresh-fail — deterministic from code path |

**Note on method:** server behavior is proven by the live `curl` transcripts above. The rendered client strings are established by deterministic code-trace (the render logic is pure `err.message` / forced redirect) because no browser/RN automation is installed in this repo. A pixel-level browser capture of the web toast-then-reload would require adding Playwright — flagged for Srijan's call; not done in Phase 0.

### Target behavior (spec §1.3 / §1.4)
Refresh flow **never** triggers for `/auth/login`, `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password`; the login-401 surfaces the server envelope directly, mapped by `errorCode` `AUTH_INVALID_CREDENTIALS` → inline **"Invalid email or password."** on the form (web + mobile).

**Resolution — FIXED Phase 2, VERIFIED Phase 5:** both interceptors now exclude the 4 auth endpoints (`apps/web/lib/api.ts` + `apps/mobile/lib/api.ts` `isAuthEndpoint`). Web login shows the message inline; mobile login reads the envelope via `getErrorDisplay`. Live re-probe (Phase 5, final branch): wrong login → `401 {"code":"AUTH_INVALID_CREDENTIALS","message":"Invalid email or password."}`. The literal string "No refresh token available" no longer exists in any render/Alert path (mobile acceptance grep = 0).

---

## Contract amendments (Checkpoint 0 → Phase 1)

### Envelope decision (Checkpoint-0 amendment 1) — nested shape KEPT, not flattened
The API error envelope is **not** flattened. The existing nested shape is retained and
extended in place:
```json
{ "success": false, "error": { "code": "AUTH_INVALID_CREDENTIALS", "message": "…", "details": null, "requestId": "…" } }
```
- `code` now carries a **semantic catalog** value (e.g. `AUTH_INVALID_CREDENTIALS`) instead of
  the HTTP status name — the only change to that field's meaning.
- `requestId` is **added inside `error`** (reused from the existing `X-Request-Id` correlation id).
- Prisma `P2002`→`CONFLICT_DUPLICATE` / `P2025`→`RESOURCE_NOT_FOUND` mapping, class-validator →
  `VALIDATION_FAILED` (422) with `details.fields`, and the prod/dev leak rules are all in place (§1.1).

Clients keep reading `error.code` / `error.message` — **no structural break**. The spec's flat
`{ statusCode, errorCode, … }` example in §1.1 is **superseded** by this amendment. Catalog source
of truth: `apps/api/src/modules/common/errors/error-codes.ts` (note: under `modules/common/` to
match the repo layout, vs the spec's `src/common/` path).

### ERR-1-CONTRACT-1 — validation now 400 → 422 (CLIENT-FACING; Phase 3/4)
class-validator failures previously returned **HTTP 400** with `error.message` as a **`string[]`**
of field messages. As of Phase 1 they return **HTTP 422**, code `VALIDATION_FAILED`, with per-field
messages under **`error.details.fields`** (`{ field: message }`) and `error.message` a single summary.

**Impact — must be handled in the client sweeps:**
- Web `apps/web/lib/api-errors.ts::extractApiErrors` reads `error.message` as a `string[]`; it must
  switch to `error.details.fields` for `VALIDATION_FAILED` (the array path stays as a filter backstop
  but no longer fires for DTO validation).
- Any client keying validation off HTTP **400** must also accept **422**.
- Forms should render `details.fields[field]` inline (no toast), per §1.4.

Status: **DONE / VERIFIED (Phase 5)** — web `extractApiErrors` surfaces `details.fields` (Phase 3, +test); mobile `getErrorDisplay` maps `VALIDATION_FAILED` → `fields` (Phase 4, +test). No web code branches on `status === 400` (grep clean). Live re-probe: invalid payload → `422 {"code":"VALIDATION_FAILED","details":{"fields":{…}}}`.

---

## Final status — Phase 5 close

**Every inventory item (`ERR-1-INVENTORY.md`) resolved or explicitly parked:**

| Inventory area (§) | Disposition |
|---|---|
| §A API error contract (envelope, semantic codes, requestId, Prisma map, 422, prod/dev leak) | ✅ DONE Phase 1 — global filter + `error-codes.ts`; 5 live leak probes re-passed Phase 5 |
| §B1/B2 web + mobile interceptors (auth-endpoint exclusion, single-flight, session-expiry) | ✅ DONE Phase 2 (ERR-1-BUG-1) |
| §B3 global query `onError` (both clients) | ✅ DONE — web QueryCache onError (Phase 3); mobile query `retry` classifier + inline `ErrorState` (Phase 4, no toast lib) |
| §C web display sites (extractApiErrors, hardcoded onError, bespoke extractors) | ✅ Phase 3 — `getErrorDisplay` + extractApiErrors 422; 5 hardcoded onError fixed; raw `err.message` render hits = 0. Bespoke envelope extractors left safe (documented incremental) |
| §D mobile display sites (login/change-password/assignment-detail/marks + inventory) | ✅ Phase 4 — all routed through `getErrorDisplay`; raw `err.message` render/Alert hits = 0 |
| §E errorCode catalog | ✅ DONE Phase 1 (`error-codes.ts`, single source of truth) |
| §F item 8 `FORBIDDEN_SCOPE` message alignment (server) | ✅ DONE Phase 3 — all sites use the catalog default |
| Network/offline class (first-class on mobile) | ✅ code-level proven (web vitest + mobile jest matrices); on-device airplane-mode = Srijan-verification item |

**Regression suite (Phase 5, final branch):** API **640** · Web **27** · Mobile **129** — 796 tests, 0 failures. Baseline (api 621 pre-ERR-1) never dropped.

**Srijan-verification (manual, no browser/device automation available here):**
1. Web offline: stop API → load a page → offline `ErrorState` + working "Try again".
2. Mobile airplane-mode (EAS preview APK): login + a data screen → offline message + retry.

---

## Out-of-scope items encountered
- `fee-structures` `dueDate` cast bug — stays on the **PAY-1 backlog** (spec §3), not touched by ERR-1.
- Payment-gateway (`esewa`/`khalti`) throws are **default-mapped** in Phase 1 (502 → `PAYMENT_GATEWAY_UNAVAILABLE`,
  business 400 → `BAD_REQUEST`); explicit `PAYMENT_VERIFICATION_FAILED` codes at those sites are a small
  follow-up touch (tracked in `ERR-1-INVENTORY.md §E`), not required by any Phase 1 proof.
