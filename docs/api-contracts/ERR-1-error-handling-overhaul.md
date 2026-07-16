# ERR-1 — Error Handling & Error UX Overhaul

**Repo:** AaramvaTech/Aaramva-Sikshya
**Save this file to:** `docs/api-contracts/ERR-1-error-handling-overhaul.md`
**Bug tracker artifact:** `docs/api-contracts/ERR-1-BUGS.md` (create in Phase 0)
**Branch:** `feat/err-1-error-handling` → PR → CI all-green → Srijan merges (Claude Code never merges).
**Test baseline:** 511 passing. This pass may only add tests; baseline must never drop.

---

## 0. Problem statement

Error responses across the platform leak internal strings to users. Known symptom: entering a wrong ID/password at login displays **"no refresh token available"** instead of "Invalid email or password." Root cause class: the axios refresh interceptor runs on auth-endpoint 401s and surfaces its own internal error; more broadly, there is no standard error contract, so each screen shows whatever string bubbles up (Nest defaults, Prisma messages, axios internals).

ERR-1 establishes one error contract end-to-end and fixes every user-facing error path in web and mobile.

---

## 1. Architectural rulings (already decided — do not re-litigate)

### 1.1 API error envelope (every error, no exceptions)

```json
{
  "statusCode": 401,
  "errorCode": "AUTH_INVALID_CREDENTIALS",
  "message": "Invalid email or password.",
  "details": null,
  "requestId": "req_9f8a7b6c"
}
```

- `errorCode` — SCREAMING_SNAKE from the catalog (§1.2). Machine-readable; clients key off this, never off `message`.
- `message` — safe, human-readable English default. i18n-ready: because clients map `errorCode` → display string, Nepali translations can be added later without API changes.
- `details` — optional structured payload. For `VALIDATION_FAILED`: `{ fields: { email: "Must be a valid email", ... } }` flattened from class-validator. Never contains stack traces, SQL, or Prisma metadata.
- `requestId` — from the existing structured request logging correlation ID; shown to users only on 500s ("Ref: …") so support can find the Sentry event.

Implemented via a **global NestJS exception filter** in `apps/api`:
- `HttpException` subclasses → mapped envelope.
- `Prisma.PrismaClientKnownRequestError` → mapped: P2002 → `CONFLICT_DUPLICATE` (409), P2025 → `RESOURCE_NOT_FOUND` (404), everything else → `INTERNAL_ERROR` (500). Raw Prisma message goes to the logger/Sentry only.
- class-validator `BadRequestException` → `VALIDATION_FAILED` (422) with `details.fields`.
- Unhandled exceptions → `INTERNAL_ERROR` (500), full error to Sentry + structured log with `requestId`; response body carries only the generic message and `requestId`.
- In `NODE_ENV=production`, no `stack`, no `cause`, no query text in any response body. In dev, an additional `_debug` key is permitted.

### 1.2 Error code catalog

Create `apps/api/src/common/errors/error-codes.ts` as a single exported const enum/object — the one source of truth. Initial catalog (extend as inventory demands, but every code must land here):

| errorCode | HTTP | Default message |
|---|---|---|
| AUTH_INVALID_CREDENTIALS | 401 | Invalid email or password. |
| AUTH_SESSION_EXPIRED | 401 | Your session has expired. Please log in again. |
| AUTH_TOKEN_INVALID | 401 | Your session is no longer valid. Please log in again. |
| AUTH_ACCOUNT_DISABLED | 403 | This account has been disabled. Contact your school administrator. |
| AUTH_TEMP_PASSWORD_EXPIRED | 401 | Your temporary password has expired. Contact your school administrator. |
| FORBIDDEN_ROLE | 403 | You don't have permission to do this. |
| FORBIDDEN_SCOPE | 403 | You don't have access to this record. |
| RESOURCE_NOT_FOUND | 404 | The requested record was not found. |
| CONFLICT_DUPLICATE | 409 | A record with this value already exists. |
| VALIDATION_FAILED | 422 | Please correct the highlighted fields. |
| TENANT_NOT_FOUND | 404 | School not found. Check the school address (slug). |
| TENANT_SUSPENDED | 403 | This school's account is currently suspended. |
| PAYMENT_GATEWAY_UNAVAILABLE | 502 | The payment service is temporarily unavailable. Please try again shortly. |
| PAYMENT_VERIFICATION_FAILED | 400 | Payment could not be verified. If money was deducted, it will be reconciled — contact your school. |
| STORAGE_UNAVAILABLE | 503 | File storage is temporarily unavailable. Please try again shortly. |
| RATE_LIMITED | 429 | Too many attempts. Please wait a moment and try again. |
| INTERNAL_ERROR | 500 | Something went wrong on our side. Ref: {requestId} |

Ruling: **cross-family probes must keep returning 403** with `FORBIDDEN_SCOPE` — do not weaken to 404. The hard-scoped student/parent authorization model and its existing IDOR tests are untouchable; ERR-1 only standardizes the response body shape.

### 1.3 Auth/refresh interceptor rules (web AND mobile — identical logic)

1. The refresh flow is **never** triggered by requests to `/auth/login`, `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password`. A 401 from these surfaces the server envelope directly.
2. 401 on any other endpoint → attempt refresh **once** (single-flight: concurrent 401s share one refresh promise, queued requests retry after it resolves).
3. Refresh fails or no refresh token exists → clear tokens (expo-secure-store on mobile), redirect to login, show one non-blocking notice keyed to `AUTH_SESSION_EXPIRED`. Never show "no refresh token available" or any axios/internal string.
4. First app launch with no tokens → silent redirect to login. No error UI at all.

### 1.4 Client error taxonomy → UX treatment (web + mobile)

| Class | Detection | UX |
|---|---|---|
| Field validation | `errorCode === VALIDATION_FAILED` | Inline errors under fields from `details.fields`; no toast. |
| Expected business error | Any cataloged non-500 code | Toast/inline message from client-side code→message map. |
| Session expiry | `AUTH_SESSION_EXPIRED` via interceptor | Logout + login screen + single notice. |
| Server fault | `INTERNAL_ERROR` / 5xx | Generic message + `Ref: {requestId}`. |
| Network / offline / timeout | axios `ERR_NETWORK`, timeout, no response | "Can't reach the server. Check your internet connection and try again." + Retry affordance. Mobile must handle this class first-rate (school connectivity in Nepal is unreliable). |

Each client gets one module: `getErrorDisplay(error): { kind, message, fields?, requestId? }`
- Web: `apps/web/src/lib/errors.ts`, wired into a TanStack Query global `onError` (QueryCache/MutationCache) so unhandled query errors get correct toasts by default; forms consume `fields` explicitly.
- Mobile: `apps/mobile/src/lib/errors.ts`, same contract, wired into TanStack Query defaults + the axios instance.
- The map is keyed by `errorCode`. Unknown codes fall back to the server `message` if present, else the generic message. Raw `error.message` from axios/JS is **never** rendered.

---

## 2. Phases and checkpoints

Each phase ends at a checkpoint: post raw terminal output + evidence, then **STOP and wait for Srijan's "continue."** Never auto-advance.

### Phase 0 — Inventory
- Grep the repo for error surfaces: `throw new`, `HttpException`, `catch`, `toast`, `Alert.alert`, `error.message`, `.message`, interceptor files, TanStack `onError`.
- Produce `docs/api-contracts/ERR-1-INVENTORY.md`: table of every user-facing error path (file, trigger, current displayed string, target errorCode/treatment).
- Reproduce the login bug live: wrong password against a running API through the web login form; record the exact displayed string and the actual HTTP response (curl the login endpoint too). This is BUG entry ERR-1-BUG-1.
- **Checkpoint 0:** inventory file + reproduction evidence. STOP.

### Phase 1 — API envelope + filter + catalog
- Implement `error-codes.ts`, the global exception filter, Prisma mapping, validation flattening, requestId propagation, prod/dev leak rules (§1.1).
- Refactor existing `throw`s in `apps/api` to cataloged codes (mechanical; use inventory).
- Tests: unit tests for the filter mappings **plus live HTTP proofs** (mocked tests are structurally blind — live proof required):
  - `curl` wrong-password login → body shows `AUTH_INVALID_CREDENTIALS` envelope.
  - Trigger a P2002 (duplicate) via live HTTP → `CONFLICT_DUPLICATE`, and confirm the response body contains no `prisma`, no `SELECT`, no stack (grep the raw body).
  - Trigger a forced unhandled throw behind a temporary dev-only test route → `INTERNAL_ERROR` + `requestId`; confirm the same requestId appears in the structured log line. Remove the test route before checkpoint.
  - Validation: POST invalid payload → 422 with `details.fields`.
  - Cross-family IDOR probe (existing pattern) → still 403, now with `FORBIDDEN_SCOPE`.
- **Checkpoint 1:** raw test output + raw curl outputs. STOP.

### Phase 2 — Auth flows, web + mobile interceptors
- Rewrite both axios interceptors to the §1.3 rules, including single-flight refresh.
- Fix ERR-1-BUG-1: wrong login credentials on web and mobile now display "Invalid email or password." inline on the form.
- Session-expiry path proven live: log in, delete/invalidate the refresh token server-side (SQL), trigger an authenticated request, observe logout + notice on web; same on mobile (screen recording or logged evidence acceptable for mobile UI, plus the network trace).
- No-token cold start on mobile → silent login redirect, zero error UI.
- **Checkpoint 2:** raw output + evidence per flow. STOP.

### Phase 3 — Web client sweep
- Implement `apps/web/src/lib/errors.ts` + QueryCache/MutationCache global onError + toast wiring.
- Sweep every form and mutation from the inventory: validation → inline field errors; business errors → mapped toasts; 500 → generic + Ref.
- Network-failure UX: stop the API process, exercise a page, confirm the offline message + retry (manual proof with screenshot/recording + console network trace).
- **Checkpoint 3.** STOP.

### Phase 4 — Mobile client sweep
- Same as Phase 3 for `apps/mobile`: `lib/errors.ts`, TanStack defaults, every screen from the inventory. React Native Reusables toast/alert components; no raw `Alert.alert(error.message)` anywhere (grep must return zero hits on `error.message` in render/alert paths).
- Airplane-mode test on device/emulator for the network class.
- **Checkpoint 4.** STOP.

### Phase 5 — Regression + close
- Full suite: **≥ 511 + new ERR-1 tests**, raw output required.
- Re-run the Phase 1 leak probes once more on the final branch state.
- Update `ERR-1-BUGS.md` with final status of every inventory item; write `ERR-1-CLOSE-REPORT.md`.
- PR up, CI all-green. Srijan merges.
- **Checkpoint 5 / gate close.** STOP.

---

## 3. Stop conditions

- Any inventory item whose correct errorCode is a **product decision** (e.g., whether parents should see fee-related gateway errors in detail) → stop at the current checkpoint and surface it; Claude.ai rules, Claude Code executes.
- Any change that would alter authorization semantics (status codes on scope probes, soft-scope teacher writes) → stop immediately. ERR-1 changes response *bodies*, never access rules.
- If the fee-structures `dueDate` cast bug (PAY-1 backlog) is encountered while sweeping, note it in ERR-1-BUGS.md as out-of-scope — it stays on the PAY-1 backlog.

## 4. Out of scope

- Nepali translations (structure must be ready; translation itself is a future I18N pass).
- MON-1 money issues, FIX-3 calendar bug, OPS-1/PAY-1/PAY-2 gate items.
- Retry/backoff policies beyond the single-flight refresh and manual Retry buttons.

## 5. Proof standard (reminder)

Raw terminal output only — no summaries, no "tests pass" claims without the transcript. Every server-side behavior proven with a live HTTP call; every leak rule proven by grepping the actual response body.
