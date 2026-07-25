# BILL-BUGS

Deviations from `docs/api-contracts/BILL-SPEC.md` found during implementation, logged per §8 ("Any deviation from this spec is logged in BILL-BUGS.md and raised, never decided unilaterally"). Newest first.

---

## INC-3 — Phase 1's @IsMoneyString() migration broke the OLD fee-structure endpoints live; fixed same-session (2026-07-25, found in Phase 2)

**Severity: this was a live regression in code Phase 1 shipped and Checkpoint 1 reported clean.** Found only because Phase 2's own live proof (Checkpoint 2's two-fee-structures test) needed a real HTTP POST through a `@IsMoneyString()`-validated endpoint — the first time any Phase 1-migrated DTO was exercised over real HTTP rather than a mocked unit test.

**What broke:** `POST /finance/bill/fee-structures` failed with a 500. Server log: `[prisma P2010] ... Code: 42804. ERROR: column "amount" is of type numeric but expression is of type text HINT: You will need to rewrite or cast the expression.` Postgres does not implicitly assignment-cast `text` to `numeric` even when the target column is unambiguous — a raw parameterized `$n` placeholder bound to a JS **string** (exactly what `@IsMoneyString()` produces) needs an explicit `$n::numeric` cast; a JS **number** placeholder does not (confirmed separately: `tax_rates.rate`, which deliberately stayed `@IsNumber()`, inserted fine with no cast). Phase 1's rewrite converted several finance DTO fields from `number` to `@IsMoneyString()` string but didn't add the corresponding `::numeric` casts to the raw SQL `INSERT`/`UPDATE` statements those fields feed — because every Phase 1 test for those call sites was a mocked unit test asserting on the JS value passed to `$queryRawUnsafe`, never a real query against real Postgres.

**Immediately confirmed this also broke live, currently-deployed-shape code, not just new Phase 2 code:** `PATCH /finance/fee-structures/:id/items` (the OLD table, OLD service, Phase 1 only touched its DTO) 500'd identically on a real request. This means from the moment Phase 1 shipped until this fix, **editing a fee structure's items or setting a student's custom fee amount via the real API was broken** for every tenant — `fee-structure.service.ts`'s `createFeeStructure`/`updateItems`, and `invoice.service.ts`'s `setStudentFeeAssignment` (`student_fee_assignments.custom_amount`).

**Fixed in this same session, all six affected raw SQL sites, old and new:**
- `fee-structure.service.ts`: both `fee_structure_items` INSERTs (`createFeeStructure`, `updateItems`) — added `$n::numeric` to `amount` and `fine_per_day`.
- `invoice.service.ts`: `setStudentFeeAssignment`'s `student_fee_assignments` INSERT — added `$4::numeric` to `custom_amount`.
- `transport-route.service.ts`: both `monthly_amount` sites (create INSERT, update SET).
- `late-fee-rule.service.ts`: both `value`/`cap_amount` sites (create INSERT, update SET).
- `bill-fee-structure.service.ts`: both `bill_fee_structure_items` INSERTs (`createFeeStructure`, `updateItems`).

**Live-reverified after the fix, all six:** old `PATCH .../items` now 200s with the item persisted (`amount: 2200`); `POST /finance/bill/fee-structures` now 200s (the actual Checkpoint 2 proof); transport-route and late-fee-rule creation both 200 with their string-typed money fields intact.

**Why the mocked unit tests never caught this and won't catch the next one like it:** every `*.service.spec.ts` in this module mocks `TenantPrismaService` and asserts on the JS *value* handed to `$queryRawUnsafe`/`$executeRawUnsafe` — none of them execute the SQL string against a real Postgres, so a `42804`-class type error is invisible to the entire suite. This is a real gap in Phase 1's own proof standard, not just bad luck.

**EXPLICIT SWEEP (requested after Checkpoint 2 — "don't assume six is the full count"), completed:**

1. `grep -rn "IsMoneyString" src/modules/finance/dto/` enumerated every field this bug class can touch: `BillFeeStructureItemDto.amount`; `FeeStructureItemDto.amount`/`.finePerDay`; `SetStudentFeeAssignmentDto.customAmount`; `CreateLateFeeRuleDto`/`UpdateLateFeeRuleDto` `.value`/`.capAmount`; `CreateTransportRouteDto`/`UpdateTransportRouteDto` `.monthlyAmount`. That's the complete set — nothing else in the module uses `@IsMoneyString()`.
2. Traced every real consumer of each DTO class (`grep -rln` on the class name, not assumption) to confirm no second, forgotten call site exists anywhere in the codebase beyond the ones already fixed.
3. Also grepped for `.toDb()` (the other Money method that produces a string) across the whole module — the only hit is `esewa-signature.util.ts`'s `formatEsewaAmount`, which returns a *display* string for eSewa's signed form field, never a raw SQL parameter. Not a risk.
4. Read every remaining `INSERT`/`UPDATE` in the finance module directly (`invoice.service.ts`'s invoice/invoice_items INSERT, the `recalculateFine` UPDATE, `payment.service.ts`'s payments INSERT and paid_amount UPDATEs, both gateway services' `payment_transactions` writes) and confirmed each money parameter there is a `.toNumber()`-derived JS **number**, not a `@IsMoneyString()`-derived string — the exact distinction that determines whether the cast is needed. None of these need a cast; none were touched.
5. **Live re-proved, against real Postgres, every one of the nine individual write sites this bug class could have hit** (the six files/services, both the INSERT and UPDATE path wherever both exist) — five of these nine had *not* actually been exercised in the Checkpoint 2 pass (only claimed safe by static reasoning), so they were run for real here:
   - `fee-structure.service.ts` **createFeeStructure** (OLD, INSERT) — untested at Checkpoint 2 (blocked by an existing conflict row); proved fresh against `tenant_geetanjali-school-college` (zero pre-existing finance data). 200, row persisted.
   - `fee-structure.service.ts` **updateItems** (OLD, INSERT-via-replace) — already proved at Checkpoint 2.
   - `invoice.service.ts` **setStudentFeeAssignment** (`custom_amount` INSERT) — untested at Checkpoint 2; proved fresh (confirmed no pre-existing row for the exact student+item+year combo first). 204, `custom_amount: 85.50` read back.
   - `transport-route.service.ts` **create** — already proved. **update** — untested; proved fresh. 200, `monthlyAmount: 1250.5`.
   - `late-fee-rule.service.ts` **create** — already proved. **update** — untested; proved fresh. 200, `value: 75.25, capAmount: 300`.
   - `bill-fee-structure.service.ts` **createFeeStructure** (NEW) — already proved (twice, Checkpoint 2's headline test). **updateItems** — untested; proved fresh. 200, `amount: 650.75`.

All nine now live-confirmed. Every fixture created for this sweep was fresh (never a pre-existing row, except the one `must_change_password` flag temporarily cleared on the geetanjali owner to log in — captured `true` beforehand, restored and 401-proven after) and deleted with a `count(*)` read-back afterward; both shimmed passwords restored and 401-proven.

**Separate close call while proving this live, worth recording:** my first live-proof attempt at the OLD `PATCH .../items` endpoint used an arbitrary test amount (`"2200.00"`) against `fee_structure_items` id `544af5c0-...` — a real pre-existing fixture row (`fee_category_id c9437ff9-...`, "PAY-1 Sandbox Test Fee") without reading its current value first. `updateItems` does a `DELETE` + re-`INSERT` on the whole item set, so that one call destroyed the original row outright — not an edit I could diff back. Recovered the original value (`amount: 100.00`, `fine_per_day: 0`, no due-date fields) from the two `invoice_items` rows already generated against it during the original PAY-1 session, and restored it through the same real endpoint (live-verified back to `amount: 100`). No lasting damage, but the near-miss is the same class of mistake as INC-1: touching real fixture state before capturing what it was.

## INC-2 / FIX-QUERY-DTO — Pre-existing bug found live-proofing Phase 2: query DTOs silently ignore filters/pagination over real HTTP (2026-07-25, Phase 2)

**Backlog item `FIX-QUERY-DTO`, for Srijan to prioritize separately — not folded into billing work.** Scope when picked up: audit every query DTO across the codebase (not just finance) for the same undecorated-properties-get-stripped-by-whitelist pattern, decide per-endpoint whether it's cosmetic (web app never sends `search`/custom `page`/`limit` anyway) or a live functional gap (an admin's searches/pagination are silently ignored), and fix the ones that matter using the already-correct `list-students-query.dto.ts` pattern as the template.

**Not a BILL-SPEC deviation — a significant pre-existing bug in the existing finance module (and likely well beyond it), found only because Phase 2's own new endpoints needed a real HTTP proof.**

**What's broken:** `main.ts` sets a global `ValidationPipe({ whitelist: true, transform: true })`. `whitelist: true` strips any request property with **zero class-validator decorators** before it reaches the controller — this is standard, documented NestJS behavior, not a NestJS bug. The *existing* finance query DTOs (`FeeCategoryQueryDto`, `FeeStructureQueryDto`, `InvoiceQueryDto`, `PaymentQueryDto` — all pre-Phase-2) declare `page?: number; limit?: number; search?: string; isActive?: boolean;` with **no decorators at all**. Over real HTTP this means `?search=`, `?page=`, and `?limit=` are silently discarded before the service ever sees them — confirmed live: `GET /finance/fee-categories?search=xyz-should-not-match-zzz` returns the one unrelated existing row anyway, and `?page=1&limit=1` comes back with `meta.limit: 20` (the default), not `1`. **Every list endpoint built on this pattern is unfilterable and unpaginatable from outside the process** — an admin "searching" fee categories/structures/invoices/payments by name today is silently getting the unfiltered first page every time.

**Why nobody caught it:** every existing unit test for these services calls `service.findAll(query)` directly with a hand-built plain object, bypassing `ValidationPipe` entirely — the whitelist-stripping only happens on the real HTTP path, which none of these tests exercise. I only found it because BILL-SPEC's proof standard (§8) requires exercising new endpoints over real HTTP, and my first live search-filter probe against my *own* new `/finance/fee-heads` endpoint came back unfiltered.

**Confirms this is fixable and the correct pattern already exists in this codebase:** `apps/api/src/modules/student/dto/list-students-query.dto.ts` does it right — `@IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;` etc. Whichever module wrote that one knew the gotcha; whoever wrote the finance query DTOs didn't hit it (or didn't have live-HTTP proof to catch it).

**What I did:** fixed only my own six new Phase 2 query DTOs (`FeeHeadQueryDto`, `DiscountReasonQueryDto`, `TransportRouteQueryDto`, `TaxRateQueryDto`, `LateFeeRuleQueryDto`, `BillFeeStructureQueryDto`) with proper decorators (`@Type(() => Number) @IsInt()` for page/limit, `@Transform(({value}) => value === 'true') @IsBoolean()` for boolean flags — plain `@IsBoolean()` alone rejects the query-string `"true"`/`"false"`, and `@Type(() => Boolean)` alone is a trap since `Boolean("false")` is `true`). Live-verified after the fix: search now correctly returns zero for a non-matching term and the right row for a real substring match; `?limit=1` now actually caps `meta.limit` at 1.

**Deliberately did NOT touch:** the four pre-existing finance query DTOs, or any query DTO in any other module. Fixing those is a real, valuable, but *separate* piece of work — auditing which of them matter (some list endpoints may only ever be called by the web app with default pagination and no search, making this cosmetic; others may be actively broken for real users right now) is its own scoped task, not something to fold into a billing-catalog migration unilaterally. Flagging for Srijan's prioritization, not fixing pre-emptively.

## BUGS-3 — fee_structures / fee_structure_items naming collision (2026-07-25, Phase 2, RESOLVED)

**Ruling: `bill_fee_structures` / `bill_fee_structure_items`.** Srijan chose the `bill_` prefix option. The old `fee_structures`/`fee_structure_items` tables and every service that reads/writes them (`FeeStructureService`, `InvoiceService`) are untouched. `bill_fee_structure_items.fee_structure_id` references `bill_fee_structures(id)`. The Phase 4 cutover migration renames these to the bare `fee_structures`/`fee_structure_items` after dropping the old ones — not before.

Spec §5 lists the new catalog tables as `fee_structures` and `fee_structure_items` — the same bare names as the tables `0001_baseline.sql` already created and that `FeeStructureService`/`InvoiceService` read and write today. Postgres cannot have two tables with the same name in the same schema, and R15/§2 both require the old tables to keep running untouched until the Phase 4 cutover ("Old tables are dropped in a single cutover migration at the end of Phase 4, after the ledger is proven. Not before."). So the new tables need a *different* name now, reconciled with the canonical name later.

**Confirms this is the intended shape, not a spec oversight:** §2's own "Replaced by new tables" line reads `fee_structures, fee_structure_items → same names, new definitions` — i.e. the plan was always for the new tables to *end up* under the canonical bare names, just not simultaneously with the old ones. The Phase 4 cutover migration (already planned, not yet written) is the natural place to rename the new tables into the now-vacated canonical names once the old ones are dropped.

**Options put to Srijan** (asked directly rather than picking one, per his explicit instruction not to decide this unilaterally): `bill_fee_structures` / `bill_fee_structure_items` (matches the existing `bill_catalog`/`bill_assignment`/`bill_ledger` migration-file prefix convention — chosen), `fee_structures_v2` / `fee_structure_items_v2` (explicit versioned, signals temporary), or `catalog_fee_structures` / `catalog_fee_structure_items` (named after the Phase 2 "Catalog" concept).

**Addendum — the same collision recurs one layer up, at the API route.** Spec §5 says "`/finance/fee-structures` gains `POST`, `GET`, `GET /:id`, `PATCH /:id/items`, `DELETE /:id`" — but `FinanceController` already serves exactly those five verbs at that exact path, backed by the old table, and real schools use it today (`FeeStructureService.createFeeStructure`/etc.). Registering a second controller method at the same route would either fail NestJS's route registration or silently shadow the live endpoint depending on module load order — not something to let resolve itself. Asked Srijan to confirm the natural extension of the just-chosen convention.

**Ruling: `/finance/bill/fee-structures`.** New catalog fee-structures endpoints live there; `/finance/fee-structures` keeps serving the old table completely unchanged until the Phase 4 cutover.

## INC-1 — `git checkout --` reverted uncommitted payment.service.ts work (2026-07-25, Phase 1)

**What happened:** while manually verifying the `no-float-coercion.spec.ts` guard actually detects a real violation (not a tautological pass), I appended a throwaway `Number(...)` line to `payment.service.ts`, confirmed the guard failed correctly, then ran `git checkout -- src/modules/finance/payment.service.ts` to undo it. Since the file had no earlier commit on this branch to fall back to, `git checkout --` reverted the **entire file** to the last commit on `main` — silently discarding all of task #10's Money rewrite work on that file (the `toNum`→`toMoney` conversions, the `recordPaymentInTx`/`cancelPayment`/`emitPaymentReceived` rewrites), not just the one throwaway line.

**Caught by:** the tool's own post-edit diff surfaced the full reverted file content immediately, which made the loss visible before any further work was built on top of it.

**Recovery:** re-applied the same five edits from task #10 from memory (import swap, `Number(seqRow.value)`→`.toString()`, the two `toNum`→`toMoney(...).toNumber()` pairs in `recordPaymentInTx`/`cancelPayment`, and `emitPaymentReceived`'s `toNum`→`toMoney`), then re-ran `payment.service.spec.ts` (8/8 pass, unchanged assertions — confirming the recovery was byte-for-byte equivalent to the lost version) and the guard test to confirm both were correctly restored. No data or committed history was affected — the loss was entirely local, uncommitted working-tree state, and entirely self-inflicted by an unnecessary use of a discard-style git command mid-session.

**Root cause:** used `git checkout --` (a discard-uncommitted-changes command) to undo a single test edit, without checking `git status`/considering that the file held substantial *other* uncommitted work from earlier in the same session. The instinct "undo my last edit" doesn't map to `git checkout --` unless the file has no other uncommitted changes worth protecting.

**Fix going forward:** Srijan's standing instruction — commit working Phase/task-level checkpoints to `feat/bill-ledger-core` as they land, rather than carrying long stretches of uncommitted multi-file work, so a discard-class mistake has a real commit to fall back to instead of losing everything back to the last `main` commit. This commit (Phase 1 complete) is the first application of that.

## BUGS-2 — RecordPaymentDto.amount excluded from the @IsMoneyString() migration (2026-07-25, Phase 1)

Phase 1's DTO-validator deliverable names `payment.dto.ts` as one of the three files to migrate to `@IsMoneyString()`. Its only money field, `RecordPaymentDto.amount`, is not migrated — it stays `@IsNumber() @Min(0.01) amount: number`. Raising rather than deciding silently, per the spec's own anticipated case: "If hardening a shared file forces a gateway-visible change, stop and raise it in BILL-BUGS.md rather than proceeding."

**Why it's excluded:** `RecordPaymentDto` isn't only an inbound HTTP DTO — it's also the parameter type of `PaymentService.recordPaymentInTx`, which `EsewaService.creditOnce` and `KhaltiService.creditOnce` (both R10-frozen) call directly with a plain object literal: `{ invoiceId, amount: toNum(claimed.amount), method, reference, notes }`. Changing `amount` to `string` would:

1. Break compilation of both gateway services (assigning the `number` produced by the amount-derivation chain to a `string`-typed field), directly violating R10 ("must leave EsewaService, KhaltiService and recordPaymentInTx compiling ... unchanged").
2. Break the pinned assertions in `esewa.service.spec.ts:254` and `khalti.service.spec.ts:274-283`, both of which assert `recordPaymentInTx` is called with `amount: 600` — a plain JS number, not a string — as part of the frozen rail's "passing unchanged" guarantee.

**Why this is a narrow, low-cost exception, not a hole in the hardening:** `dto.amount` was never actually a float-coercion site in the first place — grep of the Phase 0 inventory confirms `payment.service.ts` never calls `parseFloat`/`Number()`/`Math.round`/`toFixed` on `dto.amount` anywhere; it flows straight from the DTO into the `payments` INSERT as a single opaque parameter, no arithmetic performed on it in application code. The `Money` discipline is still fully applied everywhere `dto.amount` is *read back* afterward (`toNum(payment.amount)` sites in `emitPaymentReceived`, reports, etc. — all rewritten to `Money.fromDb(...)` in this phase). The gap this leaves is narrower than it sounds: a malicious/malformed client could still send `amount: 1500.999` (a JS number with 3dp) through `@IsNumber() @Min(0.01)`, which class-validator accepts and which then round-trips through Postgres unrounded (`NUMERIC(10,2)` will itself round it to `1501.00` at the storage layer, per Postgres's own column-scale rounding, not app code) — a pre-existing behavior, unchanged by this phase either way.

**Left for a later phase to resolve properly, without unilaterally deciding it now:** either (a) split `RecordPaymentDto` (the inbound HTTP-validated type) from an internal `RecordPaymentInput` (what `recordPaymentInTx` actually accepts, keeping it a `number` or moving it to `Money` directly) so the DTO's wire format can change independently of the gateway-internal call sites, or (b) leave it exactly as-is permanently, since PAY-1/PAY-2's own backlog entry already says gateway `payments`-table verification happens "after BILL-5," at which point `RecordPaymentDto`'s shape is due for a real rewrite anyway. Not decided here.

## R15-REVISION — Checkpoint 0 rulings (2026-07-25)

Srijan's rulings on the two items raised below, now baked into `BILL-SPEC.md` directly (§1 R15, §4 Phase 1 deliverables):

- **BUGS-1.1 resolved:** widen `fee_structure_items.fine_per_day` and `invoice_items.fine_per_day` (both `NUMERIC(8,2)` → `NUMERIC(12,2)`). `invoices.fine_amount` is untouched — it was never narrow, and it's frozen by R10 (gateway rail) regardless.
- **BUGS-1.2 resolved, R15 superseded:** no tenant finance tables are truncated, ever. R15 now reads: Phase 1 money-hardening tests run against a disposable `tenant_bill_scratch` schema (created/dropped by test setup, never a real tenant). Live proof in Phases 2–4 uses `demo`. `motherland_school` and `test` stay untouched until the Phase 4 cutover, which gets its own spec and dry-run.

## BUGS-1 — Phase 0 discovery: two spec-premise mismatches (2026-07-25, resolved above)

**1. Item 7's column name is wrong.** The spec says "Confirm `fine_amount` is `NUMERIC(8,2)`." Live DB (`tenant_demo`, confirmed identical in migration source `0001_baseline.sql`):

- `invoices.fine_amount` is `NUMERIC(10,2)`, not `(8,2)`.
- `fee_structure_items.fine_per_day` and `invoice_items.fine_per_day` — a *different* column — are the ones actually at `NUMERIC(8,2)`.

Phase 1's deliverable ("Widen `fine_amount` from `NUMERIC(8,2)` to `NUMERIC(12,2)`") is written against a column that is not narrow. The column that *is* narrow (`fine_per_day`, in two tables) is not named in the deliverable at all. Raised at Checkpoint 0 for a ruling on which column(s) Phase 1 should actually widen.

**2. R15's "dev tenant" framing doesn't match the data.** R15 says "Dev tenant finance tables are truncated at Phase 1. No data migration" — singular, implying one tenant holds finance data. Live row counts show **three** tenant schemas with real finance rows: `tenant_demo` (2 invoices), `tenant_motherland_school` (42 invoices, 108 invoice_items, 22 payments), and `tenant_test` (60 invoices, 120 invoice_items, 40 payments). `motherland-school` in particular has substantial history referenced across many prior sessions (MIG-3, FILE-1, EAS-1, etc.) — it reads as a populated reference tenant, not throwaway dev data. Raised at Checkpoint 0: does R15's truncation apply to all three, or only `demo`?
