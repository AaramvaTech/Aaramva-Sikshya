import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { ERROR_CATALOG } from '../error-codes';

/**
 * ERR-MAP-1 close-out — every `code` a throw site puts on the wire must exist
 * in ERROR_CATALOG.
 *
 * `errorBody()` is already safe: its parameter is typed `ErrorCode`, so tsc
 * rejects an unknown code. The gap this closes is the RAW OBJECT LITERAL —
 * `throw new ForbiddenException({ code: 'FOO', message: '…' })` — which no type
 * checks, and which `HttpExceptionFilter.fromHttpException` then preserves
 * verbatim ("a non-catalog custom code is preserved but should not occur
 * post-ERR-1"). Two such codes reached clients unnoticed; this is the test that
 * would have caught them the day they were written.
 *
 * Scoped to a window after `throw new …Exception(` rather than every `code:`
 * literal in the tree, because plenty of non-error objects have a `code` field
 * — `{ name: 'Mathematics', code: 'MATH' }` in the subject seeds, for one.
 */

const SRC = resolve(__dirname, '..', '..', '..', '..');

/** Chars after the `throw` to search. Long enough for a multi-line body,
 *  short enough not to bleed into whatever follows the statement. */
const WINDOW = 300;

const THROW = /throw new [A-Za-z]*Exception\(/g;
const CODE = /code:\s*'([A-Z][A-Z0-9_]{2,})'/g;

/**
 * Thrown to clients but deliberately NOT in the catalog, pending a decision
 * that is not an error-mapping one.
 *
 * `GATEWAY_DISABLED` / `GATEWAY_INITIATE_FAILED` — whether "this gateway is not
 * configured on this server" collapses into the existing SERVICE_UNAVAILABLE,
 * or deserves its own code because a school can act on it (use the other
 * gateway) in a way a generic 503 does not convey, is a **PAY-1 / PAY-2**
 * product call. Recorded in ERR-MAP-1-phase0.md §12.3.
 *
 * This list is not a parking space. Adding to it needs a ticket reference and
 * the same scrutiny as adding a catalog entry — and the test below fails if an
 * entry here is ever added to the catalog, so a stale exclusion cannot linger.
 */
const PENDING_DECISION: ReadonlySet<string> = new Set([
  'GATEWAY_DISABLED',
  'GATEWAY_INITIATE_FAILED',
]);

function tsFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      out.push(...tsFilesUnder(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Every code literal thrown in an exception body, with the file it came from. */
function thrownCodes(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of tsFilesUnder(SRC)) {
    const src = readFileSync(file, 'utf8');
    for (const t of src.matchAll(THROW)) {
      const window = src.slice(t.index, t.index + WINDOW);
      for (const c of window.matchAll(CODE)) {
        const rel = file.slice(SRC.length + 1).split(sep).join('/');
        const at = found.get(c[1]) ?? [];
        if (!at.includes(rel)) at.push(rel);
        found.set(c[1], at);
      }
    }
  }
  return found;
}

describe('ERROR_CATALOG completeness', () => {
  const thrown = thrownCodes();

  it('finds throw sites at all — the scanner is not silently matching nothing', () => {
    // Guards against the regex or SRC path rotting into a test that passes by
    // scanning an empty set, which is the classic way a sweep like this dies.
    expect(SRC.endsWith('src')).toBe(true);
    // Exactly three sites use a raw literal today; everything else goes through
    // errorBody(), whose `errorBody('X')` shape this regex deliberately does not
    // match (it is already type-safe). So the floor is 3, not some larger
    // number — and naming the members is a better rot-guard than a count.
    expect(thrown.size).toBeGreaterThanOrEqual(3);
    expect([...thrown.keys()]).toEqual(
      expect.arrayContaining([
        'PASSWORD_CHANGE_REQUIRED',  // guard, raw literal
        'GATEWAY_DISABLED',          // eSewa + Khalti, raw literal
        'GATEWAY_INITIATE_FAILED',   // Khalti, raw literal
      ]),
    );
  });

  it('every thrown code is in the catalog, or a documented exclusion', () => {
    const orphans = [...thrown.entries()]
      .filter(([code]) => !(code in ERROR_CATALOG) && !PENDING_DECISION.has(code))
      .map(([code, files]) => `${code} (${files.join(', ')})`);

    expect(orphans).toEqual([]);
  });

  it('an exclusion disappears the moment its code is cataloged', () => {
    // Self-cleaning: when PAY-1/PAY-2 rules and the code is added to
    // ERROR_CATALOG, this fails until the stale exclusion is deleted.
    for (const code of PENDING_DECISION) {
      expect(code in ERROR_CATALOG).toBe(false);
    }
  });

  it('the exclusions are still actually thrown — no dead entries', () => {
    // If a gateway throw is deleted or renamed, the exclusion is dead weight
    // and should go with it.
    for (const code of PENDING_DECISION) {
      expect([...thrown.keys()]).toContain(code);
    }
  });
});
