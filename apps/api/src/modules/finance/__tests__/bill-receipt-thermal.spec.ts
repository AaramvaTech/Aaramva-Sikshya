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
describe('BillReceiptService (80mm thermal)', () => {
  const service = new BillReceiptService();

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

describe('drCrMarker', () => {
  it('maps the ledger\'s three states, with ZERO carrying no marker', () => {
    expect(drCrMarker('OWES')).toBe('(DR)');
    expect(drCrMarker('ADVANCE')).toBe('(CR)');
    expect(drCrMarker('ZERO')).toBe('');
  });
});
