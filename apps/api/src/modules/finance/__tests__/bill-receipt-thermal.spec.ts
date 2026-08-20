import PDFDocument from 'pdfkit';
import { BillReceiptService, BillReceiptData } from '../bill-receipt.service';
import { BalanceSign } from '../ledger.util';
import { drCrMarker } from '../print/a5-sheet';

/**
 * The 80mm thermal slip is a frozen renderer, but it gained the balance-after
 * line from the same data the A5 uses — and with it the same defect: a ZERO
 * balance printed "(DR)". It had no spec of its own; this is the first.
 *
 * The service builds its own PDFDocument internally, so the only way to see
 * what it actually draws is to record calls on the prototype for the duration
 * of a render. Asserting on the composed label rather than on a re-implemented
 * copy of the rule is the whole point — a test that recomputed the marker
 * itself would pass even if the renderer regressed.
 */
const data = (
  balanceAfter: number | null,
  balanceAfterSign: BalanceSign | null,
): BillReceiptData => ({
  tenant: {
    name: 'Demo School Nepal', principalName: 'Dr. Kamala Shrestha', accentColor: '#0d5c43',
    address: 'Naya Baneshwor, Kathmandu-10, Nepal', phone: '01-4780123',
    website: 'https://demoschool.edu.np', panNumber: '301234567', registrationNumber: 'REG-1',
    logoBuffer: null, principalSignatureBuffer: null, schoolStampBuffer: null,
  },
  receiptNumber: 'RCPT-2083-000021', receivedDateAd: '2026-08-12', receivedDateBs: '2083-04-27',
  studentName: 'Binod Gurung', className: 'Grade 9', sectionName: 'B', rollNumber: '22',
  method: 'CASH', txnRef: null, amount: 1000,
  allocations: [{ invoiceNumber: 'BINV-2083-000003', amount: 1000, installment: 'Shrawan 2083' }],
  advanceAmount: 0, appliedToBalance: 0, advanceCredit: 0,
  balanceAfter, balanceAfterSign, receivedByName: 'Sita Maharjan',
  amountInWordsEn: 'One Thousand Rupees', amountInWordsNe: null, language: 'EN',
});

describe('BillReceiptService (80mm thermal)', () => {
  const service = new BillReceiptService();


  /** Every string the renderer draws during one render. */
  async function drawnText(d: BillReceiptData): Promise<string[]> {
    const seen: string[] = [];
    const proto = PDFDocument.prototype as unknown as { text: (...a: unknown[]) => unknown };
    const original = proto.text;
    proto.text = function patched(this: unknown, str: unknown, ...rest: unknown[]) {
      seen.push(String(str));
      return original.call(this, str, ...rest);
    };
    try {
      const buf = await service.render(d);
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    } finally {
      proto.text = original;
    }
    return seen;
  }

  const balanceLine = (seen: string[]): string =>
    seen.find((t) => t.includes('Balance after this payment')) ?? '';

  it('prints (DR) when the student still owes', async () => {
    expect(balanceLine(await drawnText(data(2150, 'OWES')))).toContain('(DR)');
  });

  it('prints (CR) when the student is in credit', async () => {
    expect(balanceLine(await drawnText(data(500, 'ADVANCE')))).toContain('(CR)');
  });

  it('prints NO marker on a ZERO balance', async () => {
    // "Rs. 0.00 (DR)" tells a parent they owe zero rupees. The ledger reports
    // ZERO as its own state and the slip must not collapse it into a debit.
    const seen = await drawnText(data(0, 'ZERO'));
    const line = balanceLine(seen);
    expect(line).toBeTruthy();
    expect(line).not.toContain('(DR)');
    expect(line).not.toContain('(CR)');
    // The line itself still renders, with the amount.
    expect(seen.some((t) => t.includes('0.00'))).toBe(true);
  });

  it('SUPPRESSES the balance line entirely for a payment that never posted', async () => {
    // ledger_entry_id NULL means the instrument never cleared. There is no
    // "after" — the line must not appear at all, rather than fall back to the
    // live balance and caption it as this payment's outcome.
    const seen = await drawnText(data(null, null));
    expect(balanceLine(seen)).toBe('');
    // The rest of the slip still renders.
    expect(seen.some((t) => t.includes('RCPT-2083-000021'))).toBe(true);
  });
});

/**
 * A renderer that positions by arithmetic on a cursor can always overprint, and
 * nothing else here would notice. This is the guard.
 *
 * The rule: two runs overprint when their baselines sit within HALF the SMALLER
 * run's type size and their inked x-extents overlap.
 *
 * Why half, and why the smaller run — both deliberate:
 *   - Sharing a baseline exactly is NOT a collision. Every meta row is a label
 *     on the left and a value on the right, by design.
 *   - The smaller run is the one that gets swallowed, so its size sets the
 *     scale of what counts as "too close".
 *   - The design deliberately tucks small tracked eyebrows close above large
 *     figures (AMOUNT RECEIVED sits 12.5pt above an 18pt total, digit-tops
 *     landing near the label's baseline). Measuring against the taller run, or
 *     against the font's full ascender, flags that intentional pairing. Half
 *     the smaller size separates the real defect (1.64pt at 7.5pt type) from
 *     the intended tight pairing (12.5pt at 8pt type) with room to spare either
 *     way.
 *
 * This is a proximity heuristic, not a rasteriser. It catches text drawn at
 * effectively the same baseline that should have been on separate lines, which
 * is the regression class. It would not catch a glyph-level near-touch.
 */
describe('BillReceiptService — no two text runs may overprint', () => {
  const service = new BillReceiptService();

  interface Run { text: string; y: number; size: number; left: number; right: number }

  async function runsOf(d: BillReceiptData): Promise<Run[]> {
    const runs: Run[] = [];
    const proto = PDFDocument.prototype as unknown as { text: (...a: unknown[]) => unknown };
    const original = proto.text;
    proto.text = function patched(this: never, str: unknown, x?: unknown, y?: unknown, ...rest: unknown[]) {
      const self = this as unknown as {
        x: number; y: number; _fontSize: number; widthOfString: (s: string) => number;
      };
      const ax = typeof x === 'number' ? x : self.x;
      const ay = typeof y === 'number' ? y : self.y;
      const opts = (typeof x === 'object' ? x : typeof y === 'object' ? y : rest[0]) as
        { width?: number; align?: string } | undefined;
      const tw = self.widthOfString(String(str));
      let left = ax;
      if (opts?.width && opts.align === 'right') left = ax + opts.width - tw;
      else if (opts?.width && opts.align === 'center') left = ax + (opts.width - tw) / 2;
      runs.push({ text: String(str), y: ay, size: self._fontSize, left, right: left + tw });
      return original.call(this, str, x as never, y as never, ...(rest as never[]));
    };
    try {
      await service.render(d);
    } finally {
      proto.text = original;
    }
    // render() measures on a throwaway pass then draws for real; keep the real one.
    const half = runs.length / 2;
    return Number.isInteger(half) && half > 0 && runs[0].text === runs[half].text
      ? runs.slice(half) : runs;
  }

  const overprints = (runs: Run[]): string[] => {
    const bad: string[] = [];
    for (let i = 0; i < runs.length; i++) {
      for (let j = i + 1; j < runs.length; j++) {
        const a = runs[i], b = runs[j];
        const apart = Math.abs(a.y - b.y);
        if (apart >= Math.min(a.size, b.size) / 2) continue;
        const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        if (overlap > 0.5) {
          bad.push(`"${a.text}" and "${b.text}" are ${apart.toFixed(2)}pt apart (${Math.min(a.size, b.size)}pt type) overlapping ${overlap.toFixed(1)}pt horizontally`);
        }
      }
    }
    return bad;
  };

  const shapes: Array<[string, BillReceiptData]> = [
    ['one allocation', data(2150, 'OWES')],
    ['zero balance', data(0, 'ZERO')],
    ['advance credit', { ...data(-1500, 'ADVANCE'), allocations: [], advanceCredit: 1500, amount: 1500 }],
    ['unposted (no balance line)', data(null, null)],
    ['long school + long principal', {
      ...data(2150, 'OWES'),
      tenant: {
        ...data(2150, 'OWES').tenant,
        name: 'Shree Sarvodaya Higher Secondary Boarding School and College',
        principalName: 'Dr. Kamala Devi Shrestha Pradhan',
      },
    }],
  ];

  const pageShapes = shapes;

  it.each(shapes)('%s: nothing overprints', async (_name, d) => {
    expect(overprints(await runsOf(d))).toEqual([]);
  });

  it('the signature block clears the school name by a full line', async () => {
    // The exact regression: drawMixedText left doc.y on the line it had just
    // drawn, so the caller's moveDown(0.15) advanced a FRACTION of a line and
    // the principal's name landed 0.58mm under "For: {School}" at ~2.7mm type.
    const runs = await runsOf(data(2150, 'OWES'));
    const school = runs.find((r) => r.text.includes('Demo School Nepal') && r.y > 200);
    const principal = runs.find((r) => r.text.includes('Kamala'));
    expect(school).toBeDefined();
    expect(principal).toBeDefined();
    expect(principal!.y - school!.y).toBeGreaterThanOrEqual(school!.size);
    // 0.58mm before the fix; a full line after it.
  });

  // The regression this file failed to catch: the trailing-blank assertion
  // below passed at 9.9mm while "Thank you" sat on page 2. A height assertion
  // that ignores page count is not a fit assertion — the A5 has asserted page
  // count from the start and this must too.
  it.each(pageShapes)('%s: renders as exactly ONE page', async (_n, d) => {
    const buf = await service.render(d);
    const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBe(1);
  });

  it('leaves no more than 10mm of blank roll after the last line', async () => {
    // computeHeight()'s estimate ran ~30% over and fed 4cm of blank paper per
    // receipt. The page is now measured from the real drawn extent.
    const buf = await service.render(data(2150, 'OWES'));
    const pageH = +(buf.toString('latin1')
      .match(/\/MediaBox\s*\[\s*0\s+0\s+[\d.]+\s+([\d.]+)\s*\]/) as RegExpMatchArray)[1];
    const runs = await runsOf(data(2150, 'OWES'));
    const contentEnd = Math.max(...runs.map((r) => r.y));
    const trailingMm = (pageH - contentEnd) * (25.4 / 72);
    expect(trailingMm).toBeGreaterThan(0);
    expect(trailingMm).toBeLessThan(10);
  });
});

describe('drCrMarker', () => {
  it('maps the ledger\'s three states, with ZERO carrying no marker', () => {
    expect(drCrMarker('OWES')).toBe('(DR)');
    expect(drCrMarker('ADVANCE')).toBe('(CR)');
    expect(drCrMarker('ZERO')).toBe('');
  });
});
