# ERR-1 — Error Surface Inventory (Phase 0)

**Status:** Phase 0 / Checkpoint 0 (read-only inventory — no code changed).
**Branch:** `feat/err-1-error-handling`
**Method:** static grep sweep across `apps/api`, `apps/web`, `apps/mobile` + live HTTP reproduction against the running dev stack (API `:3001`, web `:3000`, Postgres `:5432`). Raw evidence in `ERR-1-BUGS.md` (ERR-1-BUG-1).

This is a map of **where users see errors and what they currently see**, plus the target `errorCode`/treatment from the spec §1.2/§1.4. It is not a line-by-line dump of all 272 `throw`s / 292 toasts — those route through a small number of shared surfaces catalogued below.

---

## A. Current API error contract vs. ERR-1 target

**Global filter:** `apps/api/src/modules/common/filters/http-exception.filter.ts` (`@Catch()`, catches everything). It is registered app-wide and every response passes through it.

Current envelope (verified live):
```json
{ "success": false, "error": { "code": "UNAUTHORIZED", "message": "Invalid credentials", "details": null } }
```

Target envelope (spec §1.1):
```json
{ "statusCode": 401, "errorCode": "AUTH_INVALID_CREDENTIALS", "message": "Invalid email or password.", "details": null, "requestId": "req_..." }
```

| Aspect | Current | Target (§1.1) | Gap |
|---|---|---|---|
| Wrapper key | `error: { code, message, details }` | flat `statusCode / errorCode / message / details / requestId` | Envelope reshape (breaking — clients read `error.code`/`error.message` today) |
| Machine code | `code` = `HttpStatus[status]` name (e.g. `UNAUTHORIZED`, `NOT_FOUND`) unless an exception carries a custom `code` | `errorCode` = SCREAMING_SNAKE from catalog (e.g. `AUTH_INVALID_CREDENTIALS`) | No semantic catalog; `code` is the HTTP-status name for ~all throws |
| requestId | **Absent from body.** Present as response header `X-Request-Id` (verified: `X-Request-Id: 3b86e783-…`) | In body on 500s | Propagate the existing correlation id into the body |
| Prisma mapping | **None** (grep `Prisma\|P2002\|P2025` in `filters/` → 0 hits). Prisma error → non-`HttpException` → `else` branch → HTTP 500 `INTERNAL_SERVER_ERROR` | P2002→`CONFLICT_DUPLICATE`(409), P2025→`RESOURCE_NOT_FOUND`(404), else→`INTERNAL_ERROR`(500) | Add Prisma mapping |
| Dev leak | Non-HTTP errors: `message = exception.message` when `NODE_ENV !== 'production'` (filter lines 72–74) — raw Prisma/JS message reaches the body in dev | prod: no stack/cause/query; dev: `_debug` key permitted | Gate raw text behind `_debug`, never in `message` |
| Validation | class-validator `BadRequestException` → `message` is a **string[]** of field messages (see `apps/web/lib/api-errors.ts` comment); HTTP 400 | `VALIDATION_FAILED` (422) + `details.fields: { field: msg }` | Flatten to `details.fields`; status 400→422 |
| Custom codes today | Only a few carry a real `code` (e.g. `PASSWORD_CHANGE_REQUIRED` — used by both interceptors) | All errors carry a catalog `errorCode` | Backfill catalog codes |

**Existing throws to recatalog:** 272 `throw new *Exception` across 57 files (services/guards/middleware). They currently surface `HttpStatus` names, not semantic codes. Representative high-traffic files: `student.service.ts` (22), `file-access.service.ts` (17), `guardian.service.ts` (11), `storage.service.ts` / `payroll.service.ts` / `assignment.service.ts` / `staff.service.ts` (10 each). All are mechanical remaps in Phase 1 (spec §Phase 1).

---

## B. Client interceptors — the highest-value error paths (ROOT of BUG-1)

### B1. Web — `apps/web/lib/api.ts`
| # | Trigger | Current behavior / displayed string | Target (§1.3 / §1.4) |
|---|---|---|---|
| B1-a | **401 on `/auth/login`** (wrong password) | Interceptor does NOT exclude auth endpoints → treats login-401 as session-expiry → fires `POST /auth/refresh` (→401) → `catch{}` → `useAuthStore.logout()` + `window.location.href='/login'` → **full page reload; the login-page toast is wiped/flashed**. Intended "Invalid email or password" never persists. | Exclude `/auth/login|refresh|forgot-password|reset-password` from refresh; surface server envelope directly → inline "Invalid email or password." |
| B1-b | 401 on any other endpoint | `_retry` once, refresh, replay. No single-flight → concurrent 401s each fire their own refresh. | Single-flight shared refresh promise |
| B1-c | Refresh fails / no session | `logout()` + hard `window.location.href` redirect (super-admin vs `/login`) | Clear tokens + redirect + one notice keyed `AUTH_SESSION_EXPIRED` |
| B1-d | HTTP 2xx with `success:false` body | `Promise.reject(new Error("`code`: `message`"))` — manufactures a client Error string | Handled by `getErrorDisplay` |
| B1-e | `403` + `code==='PASSWORD_CHANGE_REQUIRED'` | Redirect to `/change-password` (REG-1) — **keep as-is** | Unchanged (authz semantics untouchable) |

### B2. Mobile — `apps/mobile/lib/api.ts`
| # | Trigger | Current behavior / displayed string | Target |
|---|---|---|---|
| B2-a | **401 on `/auth/login`** with no stored refresh token (fresh login, wrong password) | Interceptor treats login-401 as session-expiry → no refresh token in SecureStore → **`throw new Error('No refresh token available')`** (line 142) → rejected to `login.tsx` → rendered verbatim in the red error box. **This is the exact spec symptom string.** | Exclude auth endpoints; show "Invalid email or password." |
| B2-b | 401 elsewhere | Single-flight refresh via `failedQueue` (this half is already correct) | Keep; add auth-endpoint exclusion |
| B2-c | Refresh fails | `clearSession()` + purge active session from SecureStore, reject | Redirect + one `AUTH_SESSION_EXPIRED` notice |
| B2-d | 2xx `success:false` | `Promise.reject(new Error("`code`: `message`"))` | `getErrorDisplay` |
| B2-e | Network / offline / timeout | **No handling** — axios `ERR_NETWORK` bubbles as raw JS message | New network class → "Can't reach the server…" + Retry (§1.4, first-rate on mobile) |

### B3. Global query error handling — **absent in both clients**
- Web `apps/web/app/providers.tsx:15` — `new QueryClient({ defaultOptions: { queries: { staleTime, retry:1 } } })`. **No `QueryCache`/`MutationCache` `onError`.**
- Mobile `apps/mobile/lib/queryClient.ts` — same shape. **No `onError`.**
- Consequence: every unhandled query/mutation error is handled ad-hoc per call-site (or not at all). Spec §1.4 requires a global `onError` wired to `getErrorDisplay`.

---

## C. Web client display sites

`toast.*` (sonner): **292 calls across 55 files.** Patterns observed:

| Pattern | Example | Current displayed string | Treatment |
|---|---|---|---|
| Server-message extract w/ fallback | `?.response?.data?.error?.message ?? 'Failed to enroll student'` (`components/students/enrollment-form.tsx:85`; also `assignments/page.tsx:270`, `exams/grading-scales/page.tsx:116`, `students/[id]/edit/page.tsx:132`, `hr/staff/[id]/edit/page.tsx:112`, `library/members/page.tsx:91`, `finance/generate-invoice-dialog.tsx:111,130`) | server `message` string (keys off `message`, **not `errorCode`**); English hardcoded fallback | Map by `errorCode`; fields → inline (not toast) for `VALIDATION_FAILED` |
| Hardcoded generic `onError` | `onError: () => toast.error('Failed to deactivate student')` (`students/student-action-menu.tsx:41`; `invoice-detail-modal.tsx:149,205`; `finance/invoices/page.tsx:103`; `hr/payroll/page.tsx:505`) | fixed English, ignores actual error class (500 vs 409 vs network look identical) | Route through `getErrorDisplay(error)` |
| Login page | `login/page.tsx:74–78` `?.error?.message ?? 'Invalid email or password'` → `toast.error('Login failed', {description})` | wiped by B1-a reload | Inline field error post-B1-a fix |
| Validation surfacing | `lib/api-errors.ts` `extractApiErrors()` flattens `message` string[] | array of raw class-validator strings | Consume `details.fields` |
| Partial groundwork (POL-1 T7) | `app/(school)/error.tsx` (route boundary), `components/shared/query-error-state.tsx` (`isError`+Retry) | generic — school group only | Generalize; feed from `getErrorDisplay` |

**No network/offline taxonomy on web** — `ERR_NETWORK`/timeout falls into the `?? 'Failed to …'` fallback and reads like a server error.

---

## D. Mobile client display sites

| Site | Current displayed string | Treatment |
|---|---|---|
| `app/login.tsx:96–102` | `err.message` via `includes(': ')` split heuristic — renders raw interceptor/JS message (incl. "No refresh token available", see B2-a) | `getErrorDisplay`; inline "Invalid email or password." |
| `app/change-password.tsx:76` | same `': '` split heuristic on `err.message` | `getErrorDisplay` |
| `app/(student)/assignment-detail.tsx:74,103` | `Alert.alert(title, (err as Error).message)` — raw JS/axios message | mapped message |
| `app/(teacher)/marks.tsx:235` | `Alert.alert(title, `${…}: ${err}`)` — raw `err` interpolated | mapped/field message |
| `app/(parent)/fees.tsx:157` | `Alert.alert('Online payment', msg)` where `msg` derived from error | `PAYMENT_*` mapped copy |
| `hooks/useReportCardDownload.ts:26,47,53,68,73` | hardcoded **English** alerts ("Not signed in", "Not available yet", "Not allowed", "Downloaded", "Download failed") — bypasses i18n | map to codes (`AUTH_*`, `FORBIDDEN_SCOPE`, publish-gate) |
| Most other `Alert.alert(...)` | already i18n `t(...)` keys (assignment/attendance/leave/marks titles+bodies) — good baseline | keep; route error branches through `getErrorDisplay` |

**Spec §Phase 4 acceptance:** grep for `error.message` in render/alert paths must return **zero**. Current offenders: `login.tsx`, `change-password.tsx`, `assignment-detail.tsx`, `marks.tsx` (+`index.tsx:114` is a `console` log, not UI).
**No airplane-mode/network class on mobile** (spec calls this out as must-fix for Nepal connectivity).

---

## E. Target `errorCode` catalog → treatment (from spec §1.2 / §1.4)

New source of truth to create in Phase 1: `apps/api/src/common/errors/error-codes.ts`.

| errorCode | HTTP | Client treatment (§1.4) | Primary current surface(s) |
|---|---|---|---|
| AUTH_INVALID_CREDENTIALS | 401 | inline on login form | `auth.service.ts:104,108` (`Invalid credentials`) |
| AUTH_SESSION_EXPIRED | 401 | logout + login + one notice | interceptor refresh-fail (B1-c/B2-c) |
| AUTH_TOKEN_INVALID | 401 | logout + login | `auth.service.ts:164` (`Invalid or expired refresh token`) |
| AUTH_ACCOUNT_DISABLED | 403 | mapped toast | `auth.service.ts:103` (`is_active` false path) |
| AUTH_TEMP_PASSWORD_EXPIRED | 401 | mapped toast | (future — temp-pw expiry) |
| FORBIDDEN_ROLE | 403 | mapped toast | `roles.guard.ts` (2), guards |
| FORBIDDEN_SCOPE | 403 | mapped toast | `file-access.service.ts`, `student-me`, guardian/parent scope checks — **must stay 403 (§1.2 ruling); bodies only** |
| RESOURCE_NOT_FOUND | 404 | mapped toast | pervasive `NotFoundException` across services + Prisma P2025 |
| CONFLICT_DUPLICATE | 409 | mapped toast | duplicate guards + Prisma P2002 |
| VALIDATION_FAILED | 422 | inline field errors from `details.fields` | class-validator `BadRequestException` platform-wide |
| TENANT_NOT_FOUND | 404 | school-code screen msg | `tenant.middleware.ts` / `tenant.service.ts` |
| TENANT_SUSPENDED | 403 | mapped notice | tenant status checks |
| PAYMENT_GATEWAY_UNAVAILABLE | 502 | mapped toast | `esewa.service.ts` (6), `khalti.service.ts` (7) |
| PAYMENT_VERIFICATION_FAILED | 400 | mapped toast (reconcile copy) | esewa/khalti verify paths |
| STORAGE_UNAVAILABLE | 503 | mapped toast | `storage.service.ts` (503 when disabled) |
| RATE_LIMITED | 429 | mapped toast | `@nestjs/throttler` (login 5/min, etc.) |
| INTERNAL_ERROR | 500 | generic + `Ref: {requestId}` | filter `else` branch (all non-HTTP) |

---

## F. Priority fix list feeding later phases

1. **BUG-1 root** (§Phase 2): both interceptors must exclude `/auth/login|refresh|forgot-password|reset-password` from the refresh flow. (B1-a, B2-a.)
2. **Envelope reshape + filter** (§Phase 1): flat `statusCode/errorCode/message/details/requestId`; Prisma P2002/P2025 mapping; kill dev raw-message leak; validation → `details.fields` @ 422.
3. **Catalog** (§Phase 1): `error-codes.ts`; remap 272 throws.
4. **Global query `onError`** (§Phase 3/4): add to both `QueryClient`s → `getErrorDisplay`.
5. **`getErrorDisplay` modules**: `apps/web/src/lib/errors.ts`, `apps/mobile/src/lib/errors.ts` (keyed by `errorCode`; raw `error.message` never rendered).
6. **Network/offline class** (§1.4): first-rate on mobile (airplane-mode), plus web.
7. **Raw-message render offenders**: mobile `login.tsx`/`change-password.tsx`/`assignment-detail.tsx`/`marks.tsx`; web hardcoded-fallback toasts.

**Out of scope (noted, not touched):** Nepali translations (structure only); `fee-structures dueDate` cast bug stays on PAY-1 backlog; authorization status codes on scope probes stay 403.
