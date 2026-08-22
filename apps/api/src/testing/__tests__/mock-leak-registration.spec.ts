import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

/**
 * TEST-MOCK-LEAK-1 — every module-scope mock that can leak must be REGISTERED.
 *
 * The leak guard (`testing/mock-leak-guard.ts`) only watches mocks a spec hands
 * it, because Jest offers no way to intercept `jest.fn()` from a setup file
 * (see that file's header for the two dead ends, both verified against 30.4.2).
 *
 * Explicit registration has one failure mode: **the next spec file is uncovered
 * by default.** A guard that only watches what someone remembered to instrument
 * decays into a false sense of coverage — the suite goes green, the audit says
 * "32 files instrumented", and the file added last week is watching nothing.
 *
 * This test makes the exposure audit a STANDING GATE rather than a one-time
 * report: it re-derives the exposed set on every run and fails if anything in
 * it is unregistered.
 */

const SRC = resolve(__dirname, '..', '..');

/**
 * Files that match the hazard but are deliberately NOT registered.
 *
 * `storage.service.spec.ts` — its mocks live inside a `jest.mock()` factory
 * rather than a module-scope object literal, so there is no object for
 * `guardSurvivingMocks()` to wrap. Covering it means restructuring the factory,
 * which would have been the riskiest change in a ticket that touched 31 spec
 * files, for the file with the least to gain. Recorded in TEST-MOCK-LEAK-1.md
 * with what it would take.
 *
 * Self-cleaning, like ERR-MAP-1's catalog exclusions: if an entry here stops
 * matching the hazard — someone restructures it, or registers it — the last
 * test in this file fails until the stale exclusion is deleted.
 */
const KNOWN_EXCLUSIONS: ReadonlySet<string> = new Set([
  'modules/storage/__tests__/storage.service.spec.ts',
]);

const ONCE = /\.(mockResolvedValueOnce|mockImplementationOnce|mockReturnValueOnce|mockRejectedValueOnce)\(/;

function specFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue;
      out.push(...specFiles(full));
    } else if (entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Spans covered by a guardSurvivingMock(s)( ... ) call. */
function guardedSpans(pre: string): [number, number][] {
  const spans: [number, number][] = [];
  for (const m of pre.matchAll(/guardSurviving(?:Mocks|Mock)\(/g)) {
    let j = m.index! + m[0].length;
    let depth = 1;
    while (j < pre.length && depth > 0) {
      if (pre[j] === '(') depth += 1;
      else if (pre[j] === ')') depth -= 1;
      j += 1;
    }
    spans.push([m.index!, j]);
  }
  return spans;
}

/**
 * Counts `jest.fn()` that TRULY survives a test — evaluated once at module
 * load. One inside a top-level `function` body (a per-test factory such as
 * esewa's `makeService`) is rebuilt on every call and cannot leak, so its body
 * is skipped.
 */
function surviving(pre: string): { total: number; guarded: number } {
  const spans = guardedSpans(pre);
  const inGuard = (i: number) => spans.some(([a, b]) => i >= a && i < b);

  let total = 0;
  let guarded = 0;
  let depth = 0;
  let skipUntil: number | null = null;

  for (let i = 0; i < pre.length; i += 1) {
    const ch = pre[i];
    if (skipUntil !== null) {
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth <= skipUntil) skipUntil = null;
      }
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (pre.startsWith('function', i) && (i === 0 || ' \t\n'.includes(pre[i - 1]))) {
      const lineStart = pre.slice(pre.lastIndexOf('\n', i) + 1, i).trim();
      if (depth === 0 && ['', 'async', 'export', 'export async'].includes(lineStart)) {
        const brace = pre.indexOf('{', i);
        if (brace !== -1) {
          skipUntil = depth;
          i = brace;
          depth += 1;
          continue;
        }
      }
    } else if (pre.startsWith('jest.fn(', i)) {
      total += 1;
      if (inGuard(i)) guarded += 1;
    }
  }
  return { total, guarded };
}

interface Exposed {
  rel: string;
  total: number;
  guarded: number;
}

function exposedFiles(): Exposed[] {
  const out: Exposed[] = [];
  for (const file of specFiles(SRC)) {
    const src = readFileSync(file, 'utf8');
    if (!ONCE.test(src)) continue;
    if (!src.includes('clearAllMocks')) continue;
    const at = src.indexOf('describe(');
    if (at === -1) continue;
    const { total, guarded } = surviving(src.slice(0, at));
    if (total === 0) continue;
    out.push({ rel: file.slice(SRC.length + 1).split(sep).join('/'), total, guarded });
  }
  return out;
}

describe('mock-leak guard registration', () => {
  const exposed = exposedFiles();

  it('finds the exposed set at all — the scanner is not silently matching nothing', () => {
    expect(SRC.endsWith('src')).toBe(true);
    expect(exposed.length).toBeGreaterThan(20);
    // A file known to carry module-scope survivors AND to be registered.
    expect(exposed.map((e) => e.rel)).toContain('modules/finance/__tests__/ledger.service.spec.ts');
  });

  it('every exposed spec registers ALL of its surviving mocks', () => {
    const unregistered = exposed
      .filter((e) => !KNOWN_EXCLUSIONS.has(e.rel))
      .filter((e) => e.guarded < e.total)
      .map((e) => `${e.rel} (${e.guarded}/${e.total} registered)`);

    // If this fails on a NEW file: wrap its module-scope mock object in
    // guardSurvivingMocks({...}) from testing/mock-leak-guard.
    expect(unregistered).toEqual([]);
  });

  it('a known exclusion that stops matching the hazard must be deleted, not left', () => {
    // Self-cleaning. If someone restructures storage.service.spec.ts or
    // registers its mocks, this fails until the stale entry is removed.
    for (const rel of KNOWN_EXCLUSIONS) {
      const hit = exposed.find((e) => e.rel === rel);
      expect(hit).toBeDefined();
      expect(hit!.guarded).toBeLessThan(hit!.total);
    }
  });
});
