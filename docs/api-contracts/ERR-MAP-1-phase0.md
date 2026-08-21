# ERR-MAP-1 — Phase 0

**Status: discovery only. No implementation code written.**

**Scope as given:** Prisma P2003 foreign-key violations and invalid-storage-key errors surface as
500s; map them to 4xx through the ERR-1 envelope.

**Headline: both halves of that premise are narrower than they look, and one of them is mostly
already fixed.** P2003 is reachable from exactly one endpoint. The large FK surface throws a
*different* Prisma code that cannot be mapped wholesale. And the storage-key 500 on the print path
was removed by BILL-PRINT-1 — replaced by silence, not by a 4xx.

Everything below was verified against running code and the live database, not inferred.

---

## 1. What the filter does today

`modules/common/filters/http-exception.filter.ts`:

| Input | Result |
|---|---|
| `HttpException` | status + explicit `code`, or the status default |
| `PrismaClientKnownRequestError` **P2002** | `CONFLICT_DUPLICATE` 409 |
| `PrismaClientKnownRequestError` **P2025** | `RESOURCE_NOT_FOUND` 404 |
| **any other Prisma code** | `INTERNAL_ERROR` **500** + `Sentry.captureException` |
| anything else thrown | `INTERNAL_ERROR` 500 + Sentry (+ `_debug` name/message in dev) |

Two consequences that matter for this ticket:

- Every FK violation is **captured to Sentry** today. Mapping to 4xx typically ends that, and that
  signal is the only reason a missing guard is currently visible at all. See §7.
- The Prisma branch sets `details: null` and **no `_debug` even in dev**, so a developer hitting a
  FK violation locally sees the same opaque body a user does. The real message goes to the log line
  `[prisma P2010] …` only.

## 2. The two error shapes — measured, not assumed

This codebase has two DB paths and they throw **different codes for the same violation**. Probed
against the live database inside rolled-back transactions:

| Path | Error class | `.code` | `.meta` |
|---|---|---|---|
| Typed client (`prisma.subscription.create`) | `PrismaClientKnownRequestError` | **`P2003`** | `{modelName:'Subscription', constraint:'subscriptions_tenantId_fkey'}` |
| Raw (`$queryRawUnsafe` INSERT, tenant schema) | `PrismaClientKnownRequestError` | **`P2010`** | `{code:'23503', message:'…violates foreign key constraint "bill_payment_allocations_bill_payment_id_fkey"'}` |
| Raw, undefined column (for contrast) | `PrismaClientKnownRequestError` | **`P2010`** | `{code:'42703', message:'column "no_such_column" does not exist'}` |

**The third row is the important one.** `P2010` means "raw query failed" and nothing more — it
covers a foreign-key violation *and* a broken query. The discriminator is `meta.code`, the Postgres
SQLSTATE. Any mapping keyed on `P2010` rather than on `23503` would turn our own SQL bugs into 4xx
client errors.

## 3. Where P2003 can reach a client — exactly one endpoint

The codebase is **raw-SQL-first, including the public schema**. Outside seeds there are only three
typed-client writes: `prisma.tenant.create` (`tenant-provisioning.service.ts:81`) and
`prisma.tenant.update` (`onboarding.service.ts:100`, and the pattern referenced in
`finance-settings.service.ts`). The `Tenant` model has **no outgoing foreign key** — it is the
parent side of its only relation — so `tenant.update` cannot throw P2003 at all.

That leaves one site: the **nested** write inside `tenant.create`.

```ts
subscription: { create: { planId, status: 'TRIAL', trialEndsAt } }   // Subscription.planId → Plan.id
```

`planId` resolution, `tenant-provisioning.service.ts:65-76`:

```ts
let planId = input.planId;          // caller-supplied, NOT existence-checked
if (!planId) { …cheapest active plan…; if (!plan) throw new ConflictException(…) }
```

| Caller | Supplies `planId`? | P2003 reachable? |
|---|---|---|
| `POST /auth/register-school` (**public**) | **No** — `auth.service.ts:61-71` omits it entirely; always takes the cheapest-active-plan branch, which 409s when no plan exists | **No** |
| Super-admin onboard (`OnboardSchoolDto`) | **Yes** — `@IsUUID() planId: string`, required, shape-checked only | **Yes** |

So the only way to produce a P2003 in this system is a **PLATFORM_ADMIN** posting a well-formed UUID
that is not a real plan. The nested create is one transaction, so nothing partial persists.

**What that caller sees today:** HTTP **500**, body
`{success:false, error:{code:'INTERNAL_ERROR', message:'Something went wrong on our side. Ref: <uuid>', details:null, requestId}}`, plus a Sentry event. Nothing indicates the plan is the problem.

## 4. The real FK surface is `P2010` / `23503`, and it is large

| Schema | FK constraints |
|---|---|
| one tenant schema (`tenant_demo`) | **167** |
| `public` | 4 |

Times eight tenant schemas. Every one of those violations is `P2010` → `INTERNAL_ERROR` 500 today.
`ON DELETE` actions in use across them: `NO ACTION`, `CASCADE`, `SET NULL`.

**The codebase's existing answer is a guard at each site**, and it is explicit about why —
`assignment.service.ts:64` opens with:

```ts
// Referential checks with clear 404s (FK violations are opaque 500s).
```

The mature paths do this well. `bill-payment.service.ts:142-150` resolves MANUAL allocation targets
through `fetchInvoicesByIds` and throws `NotFoundException` per missing invoice before any insert —
the money path never relies on the FK.

**But guards fail by omission, and there is a clean example in that same function.**
`assignment.service.ts` validates `classId`, `sectionId` and `subjectId` with explicit 404s, then:

```ts
let academicYearId = dto.academicYearId ?? null;   // supplied → used directly, never checked
```

`CreateAssignmentDto.academicYearId` is `@IsOptional() @IsUUID()` — shape only. A well-formed UUID
that is not a real academic year goes straight into the INSERT and produces `23503` → **500**.

This is the archetype for the whole ticket: three guards present, one missing, and nothing about the
code makes the omission visible.

## 5. Storage keys — mostly already correct, and the print 500 is gone

| Path | Behaviour today | Verdict |
|---|---|---|
| `verifyConfirmedKey` (`storage.service.ts`) | `BadRequestException` on bad shape / wrong tenant / wrong kind / missing object / size / type | **already 4xx** |
| `FileAccessService.presignRead` | 400 missing or unparseable key; **404** cross-tenant or unreferenced (deliberately indistinguishable) | **already 4xx** |
| `getObjectBuffer` | returns `null` when not-found; **rethrows everything else** — a *malformed* key (e.g. a `data:` URI) raises `XMinioInvalidResourceName` | the only 500 source |
| `fetchImageBuffer` (`branding-color.service.ts:87`) | `try { fetch } catch { return null }` — **never throws** | cannot 500 |

**The FILE-1-BLOB 500 no longer exists on the print path.** BILL-PRINT-1 wrapped every asset load in
`optionalAsset` / `optionalImage`, which catch, fall back to the designed blank slot, and record an
`AssetMiss` logged as a WARN. `bill-document.service.ts:196-201` and
`bill-receipt-document.service.ts:218-223` are all wrapped. motherland-school's 318,839-char
`data:image/jpeg` `principalSignatureUrl` therefore produces a *silent successful* render, not an
error.

**So the AssetMiss path is not a 500 to map — it is a missing notification.** That gap is already
recorded in the BILL-PRINT-1 handoff §5.3 (the school is never told its asset failed to decode) and
belongs there, not here. Folding it into ERR-MAP-1 would be a category error: there is no HTTP
response to map, because the request succeeds.

**Remaining exposure — two unwrapped calls, both behind a guard:**
`settings.service.ts:142` and `tenant-admin.service.ts:320` call `getObjectBuffer(dto.logoFileKey)`
directly, but each is preceded by `verifyConfirmedKey`, which HEADs the object. A 500 there requires
the object to vanish between the HEAD and the GET — a race, not a malformed key. See §7.

## 6. The envelope and the naming convention new codes must match

**Shape** (`http-exception.filter.ts`, unchanged since ERR-1):

```jsonc
{ "success": false,
  "error": { "code": "…", "message": "…", "details": null, "requestId": "…",
             "_debug": {} } }   // dev only, non-Prisma throws only
```

**Catalog** (`modules/common/errors/error-codes.ts`) — 23 codes, each
`{ status: number, message: string }`, `as const satisfies Record<string, CatalogEntry>`.

Naming in force:

- `SCREAMING_SNAKE_CASE`.
- **Domain-prefixed** where the domain disambiguates: `AUTH_*` (5), `TENANT_*` (2), `PAYMENT_*` (2),
  `RECEIPT_*` (2).
- **Bare noun phrase** for cross-cutting concerns: `RESOURCE_NOT_FOUND`, `CONFLICT_DUPLICATE`,
  `VALIDATION_FAILED`, `CLASS_MISMATCH`, `STORAGE_UNAVAILABLE`, `RATE_LIMITED`.
- Messages are safe, user-facing English, no identifiers, no SQL. `INTERNAL_ERROR` alone
  interpolates `{requestId}`.
- Thrown as `throw new XException(errorBody('CODE', message?, details?))` — the **exception class**
  stays at the call site so both the HTTP status and existing `toThrow(XException)` tests hold.
- Granularity precedent: three distinct 401 auth codes, and BILL-RCPT-STATUS deliberately took two
  409 codes rather than one-plus-details, because clients key off `code` and localise from it.

**Client-side drift to fix as part of any new code.** `apps/web/lib/errors.ts` keeps a parallel
`CODE_MESSAGES` map. It currently carries **17 of the server's 23 codes**; missing:
`PASSWORD_CHANGE_REQUIRED`, `CLASS_MISMATCH`, `RECEIPT_PAYMENT_BOUNCED`, `RECEIPT_PAYMENT_VOIDED`,
`BAD_REQUEST`, `SERVICE_UNAVAILABLE`. Unknown codes fall back to the server `message`, so it
degrades gracefully — but a new code lands in **two** files and history says the second is missed
about a quarter of the time.

## 7. Which of these are genuinely 4xx, and which are 5xx in costume

**Genuinely the caller's fault (4xx):**

1. Super-admin onboard with a syntactically-valid but nonexistent `planId` (§3). The caller chose a
   value; it does not resolve. **422.**
2. Caller-supplied FK ids that no guard checks — `academicYearId` is the proven case (§4). **422**,
   or 404 to match the guarded siblings' convention in the same function.

**Server faults wearing a P2003 costume — mapping these to 4xx would be wrong:**

3. **FK violations on columns the client never supplies.** `created_by`, `marked_by`,
   `entered_by`, `assigned_by`, `tenant_id`, `overridden_by_user_id` all come from the token or the
   server. A violation there means our identity plumbing is broken. A 4xx would blame the caller for
   our bug and hide it.
4. **Races.** Parent row deleted between a guard's SELECT and the INSERT; or the storage object
   deleted between `verifyConfirmedKey`'s HEAD and `getObjectBuffer`'s GET (§5). The caller did
   nothing wrong and a retry may succeed — **409**, not 400/422, and arguably still 5xx.
5. **`ON DELETE NO ACTION` rejections** — deleting a parent that still has children. Genuinely a
   409 CONFLICT in principle. **But check reachability before designing for it:** this codebase
   soft-deletes almost everything, users are never hard-deleted (zero `DELETE FROM users`), and
   FEE-CLASS-GUARD deliberately relies on `NO ACTION` for `overridden_by_user_id`. This path may not
   be reachable at all today.
6. **Anything `P2010` that is not SQLSTATE `23503`.** `42703` (undefined column), `42P01`
   (undefined table), `22P02` (invalid text representation) are our bugs, and they arrive wearing
   the identical Prisma code (§2).

## 8. What the web does with each today

`apps/web/lib/api.ts` interceptor: refreshes on 401, redirects on `403 PASSWORD_CHANGE_REQUIRED`,
and otherwise rejects with the server envelope intact. `apps/web/lib/errors.ts` `getErrorDisplay()`
then maps it:

| Server response | `kind` | Message shown | `retryable` |
|---|---|---|---|
| 500 `INTERNAL_ERROR` (every FK violation today) | `server` | "Something went wrong on our side." + `Ref: <requestId>` | **`true`** |
| 422 `VALIDATION_FAILED` | `validation` | per-field from `details.fields` | false |
| 409 `CONFLICT_DUPLICATE` | `business` | "A record with this value already exists." | false |
| 404 `RESOURCE_NOT_FOUND` | `business` | "The requested record was not found." | false |

**`retryable: true` is actively wrong for a FK violation.** Re-submitting the same onboard with the
same bad `planId` fails identically, forever. The UI offers a Retry affordance that cannot succeed —
a concrete, present-day harm of the current mapping, independent of the message being opaque.

Per-surface: the finance/print surfaces have specific handling for `STORAGE_UNAVAILABLE`,
`RECEIPT_PAYMENT_*` and `CLASS_MISMATCH` (`lib/print-document.ts`, `lib/class-guard.ts`); everything
else funnels into `getErrorDisplay` or a generic `extractApiErrors` toast.

## 9. Flags — where a 4xx mapping would hide a real bug

1. **Never key on `P2010`.** Discriminate on `meta.code === '23503'` only. Anything looser converts
   our SQL bugs into client errors (§2, §7.6).
2. **A blanket `23503` → 4xx still hides missing guards.** The `academicYearId` case would start
   returning a correct-sounding 422 while the absent existence check stays absent forever. The
   mapping should be a **backstop**, and the guards should still be added — Phase 1 should decide
   whether it also opens a follow-up to sweep for unguarded caller-supplied FK ids.
3. **Do not silently drop the Sentry capture.** Today every FK violation raises an event, which is
   the only reason omissions like §4 are discoverable. If mapped to 4xx, keep a WARN (or a Sentry
   breadcrumb) at least initially, and prefer something that can be counted per constraint.
4. **The error does not tell you whose fault it is.** `meta.constraint` / `meta.message` name the
   constraint, not whether the offending column came from the request body. Distinguishing §7.1-2
   from §7.3 requires either an explicit allowlist of client-supplied constraints, or accepting that
   some of our own bugs will be reported as 4xx. That is a real design decision for Phase 1, not an
   implementation detail.
5. **Do not map the storage race to 400.** `getObjectBuffer` failing after a successful
   `verifyConfirmedKey` HEAD means our object disappeared, not that the caller sent a bad key (§5).
6. **Do not fold the AssetMiss path into this ticket.** It produces no error response at all — the
   request succeeds and the document prints without the asset. It is a notification gap, already
   recorded in BILL-PRINT-1 handoff §5.3.
7. **P2003's single call site may not justify filter-level work on its own.** Adding an existence
   check for `planId` in `provisionTenant` is a three-line fix that removes the only reachable
   P2003 entirely. Phase 1 should decide deliberately whether ERR-MAP-1 is really a *P2010/23503*
   ticket with P2003 as a footnote — which is what the evidence says it is.

---

## Open questions for the ruling

1. **Is the scope P2003, or `23503` regardless of Prisma code?** The evidence says the second; the
   ticket title says the first.
2. **Backstop or replacement?** Does the mapping license removing per-site guards, or must guards
   stay and the mapping only catch omissions?
3. **How to tell client-supplied from server-supplied violations** (§9.4) — allowlist, or accept the
   imprecision?
4. **Keep or drop the Sentry capture on mapped errors**, and if kept, at what level?
5. **`409` for `NO ACTION` delete rejections** — worth designing for, given it may be unreachable
   under this codebase's soft-delete convention?
6. **Fix `retryable` for these codes** — in scope here, or a separate web-side follow-up?
