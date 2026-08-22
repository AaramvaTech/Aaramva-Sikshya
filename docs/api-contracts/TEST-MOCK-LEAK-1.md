# TEST-MOCK-LEAK-1 — leaked `Once` queues can make a test pass that should fail

**Status: open, exposure recorded, nothing fixed.** Found 2026-08-21 during FEE-CLASS-GUARD-2
Phase 1.

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
