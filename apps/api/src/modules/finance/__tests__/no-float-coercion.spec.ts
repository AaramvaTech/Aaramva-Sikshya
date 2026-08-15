import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * BILL-0: a lint-rule-shaped regression test. `parseFloat`/`Number(` on a
 * money value is exactly the bug class this whole module exists to prevent
 * (Phase 0's discovery inventory found ~40 such sites; Phase 1 rewrote every
 * one to use Money). Originally scanned modules/finance/** only; MON-1
 * Phase D widened it to modules/hr/**, modules/dashboard/**, and
 * modules/library/** once each module's own float-coercion sites were
 * converted to Money (payroll/dashboard-fee/library-fine math) or, for the
 * handful of pre-existing non-money `Number(` calls (sequence-counter and
 * count parsing in hr/library), converted to `parseInt` instead — this guard
 * is a blunt lexical ban with no per-variable "is this money" awareness, so
 * widening it required those sites to not exist rather than adding
 * exceptions for them.
 *
 * `\bNumber\(` (word-boundary) deliberately does NOT match `IsNumber(` /
 * `isNumber(` — those are class-validator decorator/type names, not the
 * global `Number()` coercion function, and several DTO fields legitimately
 * keep `@IsNumber()` (percentages, grace-period day counts — non-money
 * integers/rates, not currency amounts).
 */
const BANNED = /parseFloat\(|\bNumber\(/;

const MODULES_DIR = join(__dirname, '..', '..'); // modules/
const SCAN_DIRS = ['finance', 'hr', 'dashboard', 'library'].map((m) => join(MODULES_DIR, m));
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

describe('no-float-coercion guard (modules/{finance,hr,dashboard,library}/**)', () => {
  it('contains no parseFloat( or Number( — money must go through Money', () => {
    const offenders: string[] = [];

    for (const dir of SCAN_DIRS) {
      for (const file of listTsFiles(dir)) {
        if (file.endsWith(SELF_BASENAME)) continue;
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
          // Skip comment lines — this file's own header, and khalti.util.ts's
          // explanatory comment referencing the old pattern, are prose, not code.
          const trimmed = line.trim();
          if (trimmed.startsWith('*') || trimmed.startsWith('//')) return;
          if (BANNED.test(line)) {
            offenders.push(`${file.replace(MODULES_DIR, 'modules')}:${i + 1}: ${trimmed}`);
          }
        });
      }
    }

    expect(offenders).toEqual([]);
  });
});
