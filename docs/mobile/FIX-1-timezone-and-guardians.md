# FIX-1 — Mobile Timezone Bug + Guardian Source-of-Truth Consolidation

**Save location:** `docs/mobile/FIX-1-timezone-and-guardians.md`
**Scope:** apps/mobile (Part A) and apps/api read-paths only (Part B). No schema changes, no column drops.
**Source:** Audit items P0-6 (toISOString shifting Nepal dates to previous UTC day) and P0-7 (guardians JSONB vs normalized table drift).

---

## Why P0-6 is data corruption, not polish

Nepal is UTC+05:45. Between **00:00 and 05:45 Nepal time**, `new Date().toISOString().slice(0,10)` returns *yesterday's* date. Any attendance or leave written in that window lands on the wrong day. The correct helper (`lib/time.ts` → `localDateKey`) already exists and is used elsewhere — this session converges every date-only serialization onto it.

## Part A — Mobile timezone fix

### Step 0 (mobile)

1. Read `apps/mobile/lib/time.ts` — confirm `localDateKey`'s exact signature and behavior.
2. Read the four known offenders and report the exact lines:
   - teacher `attendance.tsx` (~line 24) — POST payload date
   - teacher `leave.tsx` (~line 36) — POST payload date
   - teacher `my-attendance.tsx` — query range dates
   - parent `attendance.tsx` — query range dates
3. **Exhaustive sweep:** grep the entire mobile app for `toISOString`. For each hit, classify: (a) date-only value → must convert, (b) genuine timestamp/instant → leave alone, (c) display-only → leave alone but note. Paste the classified list before editing.

### Task A1 — Convert every class-(a) hit to `localDateKey`

- No new date logic — only the existing helper. If a hit needs a variant the helper doesn't cover (e.g., date-key of an arbitrary Date, not now), extend `lib/time.ts` with a small pure function + unit test rather than inlining math.

### Task A2 — Regression tests

- Add unit tests in the time helper's test file: construct `new Date('2026-07-07T22:00:00.000Z')` (which is **03:45 on July 8 in Kathmandu**) and assert the date key is `2026-07-08` while `.toISOString().slice(0,10)` would give `2026-07-07`. Cover both directions of the boundary.

### Verification A — raw output

1. The classified grep list (pre-edit) and a post-edit grep showing zero remaining class-(a) `toISOString` uses.
2. Mobile test/typecheck output raw.
3. **Live write proof:** with the dev API running, POST a teacher attendance mark whose client-side Date is forced to a boundary time (temporarily construct the Date in a scratch script or test hitting the same code path — do not fake the HTTP layer). Then `SELECT` the attendance row and paste it showing the Nepal-correct date. Clean up the test row with a read-back.

## Part B — Guardian read-path consolidation

### Design decision (fixed, do not revisit in-session)

The normalized `guardians` table becomes the **only read source**. The legacy `students.guardians` JSONB column is **not dropped** in this session — a column drop across 11 tenant schemas requires the MIG-1 migration runner, which doesn't exist yet. This session: converge reads, mark the JSONB deprecated, and report on write paths.

### Step 0 (api)

1. Map **every** read of `students.guardians` JSONB — audit names `sms.service.ts` and `finance.listener.ts`; grep for others (`guardians` on the student model, raw SQL touching the column). Paste the full list.
2. Map every **write** path of both sources: does student create/update write JSONB, the normalized table, or both? Is there drift today? Run a comparison query across one real tenant schema: count students where JSONB phone ≠ normalized primary-guardian phone, paste the result.
3. Read the normalized `guardians` table shape: how "primary guardian" / SMS-preferred contact is expressed (flag column? ordering?). Report before editing.

### Task B1 — Switch reads

- `sms.service.ts`, `finance.listener.ts`, and any other class-(read) hit from Step 0 now resolve guardian phone/name from the normalized table via the service layer (respect tenant scoping through `TenantPrismaService` — no cross-schema shortcuts).
- Define the lookup rule explicitly in code (primary-flagged guardian, else first by a deterministic order) and document it in a comment.

### Task B2 — Deprecate, don't drop

- Add `@deprecated` JSDoc / schema comment on the JSONB field.
- If Step 0 shows writes still populate JSONB: leave the dual-write in place (it keeps old data from going *more* stale) and add a `// TODO(MIG-1): drop students.guardians after tenant migration runner exists` marker.
- If Step 0 revealed actual drift (nonzero mismatch count), paste the mismatched rows and **stop for a decision** on backfill direction before switching SMS reads — sending SMS to the normalized number is only safe if the normalized table is the fresher source. Do not guess.

### Verification B — raw output

1. Post-edit grep proving zero remaining JSONB guardian reads outside the deprecated model definition.
2. Full api test suite raw output (baseline 278, must not decrease).
3. **Live sentinel proof:** in one demo-tenant student, set the JSONB guardian phone to a sentinel wrong value (`+97700000000`) via SQL, keep the normalized table's real value, then trigger an SMS-reading code path (e.g., the fee-reminder or absence flow in dry-run/log mode if Sparrow shouldn't actually fire — use whatever non-sending mode exists; if none, log the resolved recipient before the send call and skip the send). Paste output showing the **normalized** number was resolved. Restore the JSONB value with a read-back.

## Out of scope

- Dropping the JSONB column (needs MIG-1).
- Backfill migration if drift is found (separate decision + session).
- Push notifications, guardian-profile endpoint (audit item 19).
