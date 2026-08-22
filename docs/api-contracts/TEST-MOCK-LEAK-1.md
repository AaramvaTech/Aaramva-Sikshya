# TEST-MOCK-LEAK-1 — leaked `Once` queues can make a test pass that should fail

**Status: BUILT (detection only). Repair of any leak it finds is a separate ticket.**
Found 2026-08-21 during FEE-CLASS-GUARD-2 Phase 1; guard shipped 2026-08-22.

**Live leak count at full coverage: ZERO of 69 surviving mocks.** See §Implementation.

## The failure mode that matters

An unconsumed `mockResolvedValueOnce` **leaks forward into the next test**, where it can satisfy an
assertion that should have failed.

That direction is **silent and green**. A test asserts "the service returns the row it fetched", the
fetch it queued was never made, and the leftover from the previous test supplies a row anyway — so
the test passes while proving nothing. Nobody investigates a green suite.

**The cascade we actually hit was the loud version of the same bug, and we were lucky it was loud.**
Adding a guard before four INSERTs broke 9 tests, four of them in `LedgerService › reverse` and
`› reconcile` — tests that never call the guarded method. A leftover row queued by the `adjustment`
test (which now threw before consuming it) was picked up by `reverse`'s already-reversed check,
which got a row instead of `[]` and raised `ConflictException: already been reversed`. Loud, wrong,
and pointing at innocent tests.

The same mechanism, one assertion different, produces a false pass instead. Nothing about the code
prevents that; we simply happened to queue a value that made a later test throw rather than one that
made it agree.

## The mechanism

Three things have to be true together:

1. **A `jest.fn()` declared outside `beforeEach`** — typically a module-scope mock object like
   `const mockTx = { $queryRawUnsafe: jest.fn() }`. The same function object then survives every
   test in the file.
2. **An unconsumed `...Once(` queue on it.** Any test that ends early — a throw, an early return, a
   guard rejecting — leaves whatever it queued behind.
3. **`jest.clearAllMocks()` between tests.** `clearAllMocks` calls `mockClear`, which resets
   `mock.calls`, `instances`, `contexts` and `results` — **it does not touch queued
   implementations.** `mockReset` / `resetAllMocks` do drain them.

A `jest.fn()` created *inside* `beforeEach` cannot leak: every test gets a fresh object. That is why
most specs here are safe despite using `Once` queues heavily.

## Exposure: 32 of 141 spec files

Files matching all three conditions. **This is latent, not active** — all 141 suites pass today.
The hazard is what happens to the *next* person who adds a guard, a validation, or an early return.

Eight largest by blast radius (a leftover can reach any later test in the same file):

| Spec | tests |
|---|---|
| `finance/__tests__/bill-correction.service.spec.ts` | 36 |
| `finance/__tests__/bill-payment.service.spec.ts` | 27 |
| `student/__tests__/guardian.service.spec.ts` | 27 |
| `student/__tests__/student.service.spec.ts` | 26 |
| `finance/__tests__/ledger.service.spec.ts` | 23 |
| `storage/__tests__/storage.service.spec.ts` | 23 |
| `finance/__tests__/esewa.service.spec.ts` | 21 |
| `finance/__tests__/khalti.service.spec.ts` | 20 |

Remaining 24: `attendance/staff-attendance` (4), `attendance/student-attendance` (17),
`calendar/calendar` (18), `communication/device-token` (5), `communication/notice` (6),
`communication/notification` (5), `communication/sms` (12), `examination/marks` (4),
`examination/result` (15), `finance/bill-fee-structure` (9), `finance/bill-fine` (10),
`finance/bill-run-post-runner` (11), `finance/bulk-assign-runner` (8), `finance/cashier-shift` (13),
`finance/student-fee-structure-assignment` (16), `finance/tax-rate` (7), `hr/payroll` (8),
`hr/staff` (13), `library/book` (5), `library/issue` (11), `library/library-member` (4),
`mail/credential-mailer` (4), `mail/mail` (9), `student/guardian-scope` (8).

*Scan method: a `jest.fn(` appearing before the first `describe(`, plus any `...Once(`, plus
`clearAllMocks`. Files whose mocks are built inside `beforeEach` are excluded by construction.*

## RECOMMENDED: an `afterEach` that fails a test which left a queue unconsumed

**This is the approach to try first** (Srijan, 2026-08-22). A shared `afterEach` assertion that
fails any test ending with an undrained `...Once(` queue.

**Why this one, over the two structural fixes below:**

- **It rewrites no tests.** Both alternatives are 32-file sweeps of pure test-infrastructure churn
  with no behaviour change. This adds an assertion.
- **It converts a silent false pass into a loud, correctly-attributed failure** — and attribution is
  the point. The cascade blamed `LedgerService › reverse`, a test that had nothing to do with the
  cause. This fails the test that *left* the queue, naming it.
- **That property is the one that was missing every time this project shipped a green suite over a
  real defect.** The `useDefaulters` crash, the stale `.js` build artifacts the jest resolver was
  silently preferring over TypeScript source, `retryable: true` on permanent failures — each was
  green until someone looked. A check that makes the failure loud at the moment it is introduced is
  worth more here than a tidier mock structure.

**Two caveats, both of which must be handled before this ships:**

1. **It must not fire on specs that legitimately assert on a throw and leave a queue behind.** A
   test whose whole point is `await expect(...).rejects.toThrow()` may reasonably have queued a
   value for a call the throw prevented. Those need an opt-out — an explicit marker at the test or
   file level — and the opt-out has to be visible enough that it is not reached for casually.
2. **It is detection only.** A leak it catches still needs a hand repair: the test that queued the
   value has to be corrected to match the real call order. This finds the bug and attributes it; it
   does not fix it, and it does not make the 32 files safe on its own.

Jest exposes no queue length directly, so this needs a small helper wrapping the mocks it guards
rather than a global switch. Scope that before committing to either sweep below.

## Fallbacks, if the `afterEach` proves unworkable

Neither is one word.

**A. `clearAllMocks()` → `resetAllMocks()`.** Drains the queues, which is the actual bug. But
`mockReset` also **removes default implementations**, and several of these specs set a default in
`beforeEach` (or at module scope) and then layer `Once` values on top. Swapping the call turns those
defaults into `undefined` and breaks tests that have nothing to do with this. Each file needs its
defaults re-established inside `beforeEach` before the swap is safe.

**B. Move module-scope mocks into `beforeEach`.** Structurally correct — a fresh object per test
cannot leak. But the module-scope object is usually referenced directly by assertions throughout the
file (`expect(mockTx.$queryRawUnsafe).toHaveBeenCalledWith(...)`), so moving its construction means
rebinding every reference, usually through a `let` the `beforeEach` assigns. Mechanical, but it
touches every assertion in the file.

Both are real work across 32 files, and both are pure test-infrastructure churn with **no behaviour
change** — which is exactly why neither was smuggled into FEE-CLASS-GUARD-2 alongside four INSERT
guards, where it would have buried the reviewable part of the diff.

---

# Implementation (2026-08-22)

## What shipped

- `src/testing/mock-leak-guard.ts` — registered via `setupFilesAfterEnv`. Fails the test that
  **leaves** an unconsumed `...Once(` queue on a registered mock, naming that test and the mock's
  declaration site.
- `src/testing/__tests__/mock-leak-registration.spec.ts` — the standing gate (§Registration gate).
- 31 spec files instrumented by wrapping their module-scope mock object in `guardSurvivingMocks({…})`.

## Corrected numbers — the earlier audit over-counted

The Phase-0 figure of "75 module-scope `jest.fn()`" was **wrong, and wrong twice**. Both errors were
in the scanner, not the code:

1. The first count treated everything before the first `describe(` as module scope, including the
   bodies of top-level factory functions. `esewa`/`khalti` each declare a `makeService(env)` helper
   that is called **per test** — its seven `jest.fn()`s are rebuilt on every call and cannot leak, so
   they were never exposure at all.
2. The corrected scanner had a `.strip()` comparison against strings with trailing spaces, so
   `async function` never matched and the same seven were counted again.

**The true figures:**

| | |
|---|---|
| spec files carrying module-scope survivor mocks | **32** |
| surviving `jest.fn()` total | **69** |
| registered with the guard | **61** |
| excluded (see below) | **8** |
| unwatched and *not* excluded | **0** |

So `esewa` and `khalti` are **2/2 — fully covered**; there were never 14 misses to close.

## KNOWN EXCLUSION — `modules/storage/__tests__/storage.service.spec.ts` (8 mocks)

**Reason:** its mocks live inside a `jest.mock()` factory rather than a module-scope object literal:

```ts
jest.mock('@aws-sdk/client-s3', () => {
  const send = jest.fn();
  return { S3Client: jest.fn(() => ({ send })), PutObjectCommand: jest.fn(…), … };
});
```

There is no object for `guardSurvivingMocks()` to wrap — the mocks are created inside a factory Jest
hoists and calls, and the values are consumed by the module under test rather than held in a
variable the spec can pass anywhere. Covering it means restructuring that factory, which would have
been **the riskiest single change in a ticket that touched 31 spec files**, in the file with the
least to gain: its mocks are AWS SDK constructors, not the query-sequence mocks where leaked queues
actually cause damage.

**What it would take, so this is revisitable rather than merely recorded:**

1. Hoist `send` (and the command constructors) into module-scope `const`s the factory closes over,
   then wrap those in `guardSurvivingMocks({ send, … })`. Jest's hoisting of `jest.mock()` above
   imports is the obstacle — the factory runs before module-scope `const`s initialise, so the
   current shape cannot simply be lifted; the usual workaround is a `var` binding assigned inside
   the factory, which the guard can then register afterwards.
2. Or expose the mocks via `jest.requireMock('@aws-sdk/client-s3')` in a module-scope statement and
   register what comes back — no factory restructuring, but it depends on the returned object
   identity being the same one the SUT holds, which needs checking before relying on it.

Either is a contained change to one file. Neither belonged in this ticket.

## Registration gate — why a standing test, not a one-time audit

Explicit registration has exactly one failure mode: **the next spec file is uncovered by default.** A
guard that only watches what someone remembered to instrument decays into a false sense of coverage —
the suite is green, the audit says "31 files instrumented", and the file added last week is watching
nothing.

`mock-leak-registration.spec.ts` re-derives the exposed set on every run and fails if any file in it
has an unregistered surviving mock. That turns the exposure audit from a report into a **gate**.

Modelled on ERR-MAP-1's catalogue-completeness test, including the self-cleaning property: the
`storage` exclusion is asserted to *still match the hazard*, so if someone restructures or registers
it, the gate fails until the stale exclusion is deleted.

Pinned against a deliberate unregistered mock before shipping: injecting a stray module-scope
`jest.fn()` into `tax-rate.service.spec.ts` failed the gate with
`tax-rate.service.spec.ts (2/3 registered)`, and reverting returned it to green.

## The count, at full coverage

**Zero of 69.** No test in the suite currently leaves an unconsumed queue on a surviving mock.

That number is only meaningful because the guard was proved live *after* rollout, not just before:
injecting one leak into `ledger.service.spec.ts` fired it — naming the injected test and
`ledger.service.spec.ts:9:35` — and the leaked value then poisoned `postEntry`, reproducing the
original cascade in miniature with the correct test blamed first.

**Caveat that survives the zero:** the 8 excluded `storage` mocks are unmeasured, not proven clean.
