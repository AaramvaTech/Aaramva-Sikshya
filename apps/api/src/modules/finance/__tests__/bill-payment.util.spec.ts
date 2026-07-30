import { buildReceiptSequenceKey, buildReceiptNumber } from '../bill-payment.util';

describe('buildReceiptSequenceKey', () => {
  it('CONTINUOUS mode keys on a stable literal, not the bs year', () => {
    expect(buildReceiptSequenceKey('demo', false, 2083)).toBe('receipt:demo:CONTINUOUS');
    expect(buildReceiptSequenceKey('demo', false, 2084)).toBe('receipt:demo:CONTINUOUS');
  });

  it('RESET mode keys on the fiscal year', () => {
    expect(buildReceiptSequenceKey('demo', true, 2083)).toBe('receipt:demo:2083');
  });

  it('never shares a namespace with the invoice sequence', () => {
    expect(buildReceiptSequenceKey('demo', false, 2083)).not.toContain('bill_invoice');
  });
});

describe('buildReceiptNumber', () => {
  it('CONTINUOUS mode: RCPT-<bsYear>-NNNNNN, 6-digit zero-padded', () => {
    expect(buildReceiptNumber(false, 2083, 2083, 1)).toBe('RCPT-2083-000001');
    expect(buildReceiptNumber(false, 2083, 2083, 42)).toBe('RCPT-2083-000042');
  });

  it('RESET mode: RCPT-R<fiscalYear>-NNNNNN — structurally cannot collide with CONTINUOUS (FIX-RESET-COLLISION lesson applied from day one)', () => {
    const resetNumber = buildReceiptNumber(true, 2083, 2083, 1);
    const continuousNumber = buildReceiptNumber(false, 2083, 2083, 1);
    expect(resetNumber).toBe('RCPT-R2083-000001');
    expect(resetNumber).not.toBe(continuousNumber);
    expect(resetNumber.charAt(5)).toBe('R');
    expect(continuousNumber.charAt(5)).not.toBe('R');
  });

  it('accepts bigint seq values from the sequences table', () => {
    expect(buildReceiptNumber(false, 2083, 2083, BigInt(7))).toBe('RCPT-2083-000007');
  });
});
