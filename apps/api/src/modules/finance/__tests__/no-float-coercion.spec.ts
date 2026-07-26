import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * BILL-0: a lint-rule-shaped regression test. `parseFloat`/`Number(` on a
 * money value is exactly the bug class this whole module exists to prevent
 * (Phase 0's discovery inventory found ~40 such sites; Phase 1 rewrote every
 * one to use Money). This scans modules/finance/** so a future PR can't
 * quietly reintroduce one.
 *
 * `\bNumber\(` (word-boundary) deliberately does NOT match `IsNumber(` /
 * `isNumber(` — those are class-validator decorator/type names, not the
 * global `Number()` coercion function, and several DTO fields legitimately
 * keep `@IsNumber()` (percentages, grace-period day counts — non-money
 * integers/rates, not currency amounts).
 */
const BANNED = /parseFloat\(|\bNumber\(/;

const FINANCE_DIR = join(__dirname, '..'); // modules/finance/
// This file's own regex/prose literally contains the banned substrings —
// exclude it from the scan by name, not just skip its comment lines.
const SELF_BASENAME = 'no-float-coercion.spec.ts';

function listTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listTsFiles(full));
    } else if (entry.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('no-float-coercion guard (modules/finance/**)', () => {
  it('contains no parseFloat( or Number( — money must go through Money', () => {
    const offenders: string[] = [];

    for (const file of listTsFiles(FINANCE_DIR)) {
      if (file.endsWith(SELF_BASENAME)) continue;
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        // Skip comment lines — this file's own header, and khalti.util.ts's
        // explanatory comment referencing the old pattern, are prose, not code.
        const trimmed = line.trim();
        if (trimmed.startsWith('*') || trimmed.startsWith('//')) return;
        if (BANNED.test(line)) {
          offenders.push(`${file.replace(FINANCE_DIR, 'modules/finance')}:${i + 1}: ${trimmed}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
