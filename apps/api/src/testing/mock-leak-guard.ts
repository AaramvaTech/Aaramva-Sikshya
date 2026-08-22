/**
 * TEST-MOCK-LEAK-1 — fail the test that LEAVES an unconsumed `...Once(` queue.
 *
 * The bug (TEST-MOCK-LEAK-1.md): `jest.clearAllMocks()` calls `mockClear`,
 * which resets calls/instances/results but does NOT drain queued
 * implementations. A mock that survives the test — one declared outside
 * `beforeEach` — therefore carries whatever a test queued but never used into
 * the NEXT test, where it can satisfy an assertion that should have failed.
 * Silent, and green.
 *
 * We hit the loud version once: a row queued by an `adjustment` test was picked
 * up by `LedgerService › reverse`, which failed complaining about an entirely
 * different concern. **This guard exists so the failure names the test that
 * CREATED the leak, not the innocent one that consumed it.**
 *
 * DETECTION ONLY. It does not drain the queue and repairs nothing; a leak it
 * reports still needs the queueing test corrected by hand.
 *
 * ── Why registration is explicit ─────────────────────────────────────────────
 * Two zero-touch approaches were tried and both fail, verified against jest
 * 30.4.2:
 *   - patching `jest.fn` from `setupFilesAfterEnv` — Jest gives EVERY module its
 *     own `jest` object, so the spec never sees the patch;
 *   - patching `ModuleMocker.prototype.fn` — a spec's `require('jest-mock')`
 *     resolves to a different copy than the runtime's.
 * Jest also exposes no queue length (a mock's own props are `_isMockFunction`,
 * `mock`, and the setters — nothing pending). So the queue is tracked by
 * wrapping the four `Once` setters at registration time, and each queued
 * implementation is wrapped to count itself out when it actually runs.
 *
 * Explicit registration is also honest about scope: only mocks a spec declares
 * as surviving are watched, and a mock built inside `beforeEach` is rebuilt per
 * test and CANNOT leak, so it is none of this guard's business.
 */

interface Tracked {
  pending: number;
  origin: string;
}

type AnyMock = jest.Mock & { __leakGuard?: Tracked };

const survivors = new Set<AnyMock>();
let inTest = false;
let waiver: string | null = null;

const ONCE_SETTERS = [
  'mockImplementationOnce',
  'mockReturnValueOnce',
  'mockResolvedValueOnce',
  'mockRejectedValueOnce',
] as const;

/** First frame outside this file — a bare `jest.fn()` has no useful name. */
function declaredAt(): string {
  const lines = (new Error().stack ?? '').split('\n').slice(2);
  for (const l of lines) {
    if (l.includes('mock-leak-guard') || l.includes('node:internal') || l.includes('node_modules')) continue;
    const m = /\(?([^()\s]+\.(?:ts|js):\d+:\d+)\)?\s*$/.exec(l.trim());
    if (m) return m[1].replace(/\\/g, '/').split('/src/').pop() ?? m[1];
  }
  return 'unknown location';
}

function instrument(fn: AnyMock, origin: string): AnyMock {
  if (fn.__leakGuard) return fn;
  const state: Tracked = { pending: 0, origin };
  fn.__leakGuard = state;

  // Captured BEFORE the loop patches anything. Every flavour routes through
  // this one real setter so a single wrapper can observe execution — and it
  // must be the UNPATCHED reference, or `mockImplementationOnce`'s own patch
  // would call itself (infinite recursion) and the other three would
  // double-count.
  const realImplOnce = fn.mockImplementationOnce.bind(fn) as (i: unknown) => AnyMock;

  for (const setter of ONCE_SETTERS) {
    if (typeof fn[setter] !== 'function') continue;
    (fn as unknown as Record<string, unknown>)[setter] = function patched(value: unknown) {
      state.pending += 1;
      const impl = (...args: unknown[]): unknown => {
        state.pending = Math.max(0, state.pending - 1);
        if (setter === 'mockImplementationOnce') return (value as ((...a: unknown[]) => unknown))?.(...args);
        if (setter === 'mockReturnValueOnce') return value;
        if (setter === 'mockResolvedValueOnce') return Promise.resolve(value);
        return Promise.reject(value);
      };
      return realImplOnce(impl);
    };
  }

  // mockReset/mockRestore DO drain the real queue, so the count must follow.
  // mockClear deliberately does not — that asymmetry IS the bug.
  for (const drainer of ['mockReset', 'mockRestore'] as const) {
    const original = fn[drainer] as (() => AnyMock) | undefined;
    if (typeof original !== 'function') continue;
    (fn as unknown as Record<string, unknown>)[drainer] = function patched() {
      state.pending = 0;
      return original.call(fn);
    };
  }

  survivors.add(fn);
  return fn;
}

const isMock = (v: unknown): v is AnyMock =>
  typeof v === 'function' && (v as { _isMockFunction?: boolean })._isMockFunction === true;

/**
 * Declare that the mocks in this object OUTLIVE each test — i.e. it is built at
 * module scope rather than in `beforeEach` — and should be watched for leaked
 * queues. Returns the same object, so it wraps a declaration in place:
 *
 *   const mockTx = guardSurvivingMocks({
 *     $queryRawUnsafe: jest.fn(),
 *     $executeRawUnsafe: jest.fn(),
 *   });
 */
export function guardSurvivingMocks<T extends object>(mocks: T): T {
  const origin = declaredAt();
  for (const value of Object.values(mocks)) if (isMock(value)) instrument(value, origin);
  return mocks;
}

/** Single-mock form of {@link guardSurvivingMocks}. */
export function guardSurvivingMock<T>(fn: T): T {
  if (isMock(fn)) instrument(fn, declaredAt());
  return fn;
}

/**
 * Declare that THIS test intentionally leaves a queued value unused.
 *
 * Deliberately awkward, per the recorded caveat. Per-test only — no file-level
 * flag, no default — it must be called from inside the test body, and it wants
 * a real sentence. Someone reaching for it should have to stop and think,
 * because the honest fix is almost always to stop queueing a value the test
 * never uses.
 *
 * The case it exists for: a test whose point is
 * `await expect(...).rejects.toThrow()`, which may reasonably have queued a
 * value for a call the throw prevented.
 */
export function allowLeakedMockQueue(reason: string): void {
  if (!inTest) {
    throw new Error(
      'allowLeakedMockQueue() must be called from inside a test body. It is per-test on ' +
        'purpose: a file-level or beforeEach-level waiver would silence the whole file.',
    );
  }
  if (typeof reason !== 'string' || reason.trim().length < 25) {
    throw new Error(
      'allowLeakedMockQueue(reason) needs a real explanation of at least 25 characters — e.g. ' +
        '"the guard throws before the INSERT, so the row queued for it is never read". If the ' +
        'reason is hard to write, the queue is probably a genuine mistake.',
    );
  }
  waiver = reason.trim();
}

beforeEach(() => {
  inTest = true;
  waiver = null;
});

afterEach(() => {
  inTest = false;
  const leaked = [...survivors].filter((m) => (m.__leakGuard?.pending ?? 0) > 0);
  const detail = leaked
    .map((m) => `  - mock declared at ${m.__leakGuard?.origin}: ${m.__leakGuard?.pending} unused`)
    .join('\n');
  // Reset BEFORE asserting: the count belongs to the test that created it and
  // the next test must not inherit the blame. The real jest queue is left alone
  // — draining it would be a repair, and this ticket is detection only.
  for (const m of leaked) if (m.__leakGuard) m.__leakGuard.pending = 0;

  if (leaked.length === 0 || waiver) return;

  throw new Error(
    `TEST-MOCK-LEAK-1: this test queued mock values it never used, on ${leaked.length} ` +
      `mock(s) that survive into the next test:\n${detail}\n\n` +
      'clearAllMocks() does NOT drain those queues, so the leftovers are handed to whichever ' +
      'test runs next and may satisfy an assertion that should have failed.\n' +
      'Fix the queueing in THIS test, or — if the leftover is genuinely intended — call ' +
      'allowLeakedMockQueue("why") inside the test.',
  );
});
