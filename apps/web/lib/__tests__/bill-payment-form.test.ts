import { describe, it, expect } from 'vitest';
import {
  COUNTER_PAYMENT_METHODS,
  sumManualTargets,
  isManualAllocationValid,
  canSubmitBillPayment,
  buildPaymentConfirmationText,
} from '../bill-payment-form';

// UI-4-CHECKPOINT-A-SPEC.md §3.2/§6 — pure gating functions for the
// record-payment page. ESEWA/KHALTI deliberately excluded from the counter's
// method list (ruled: a gateway payment is only legitimate carrying a real
// verified transaction reference from the actual gateway flow).

describe('COUNTER_PAYMENT_METHODS', () => {
  it('offers only CASH and CHEQUE — never ESEWA/KHALTI, and not BANK_TRANSFER (BillPaymentService does not implement it yet, BILL-5-METHOD-GAP)', () => {
    expect(COUNTER_PAYMENT_METHODS).toEqual(['CASH', 'CHEQUE']);
  });
});

describe('sumManualTargets', () => {
  it('sums target amounts', () => {
    expect(sumManualTargets([{ billInvoiceId: 'a', amount: '1000.00' }, { billInvoiceId: 'b', amount: '500.50' }])).toBeCloseTo(1500.5, 2);
  });
  it('returns 0 for an empty list', () => {
    expect(sumManualTargets([])).toBe(0);
  });
});

describe('isManualAllocationValid', () => {
  it('rejects an empty target list', () => {
    expect(isManualAllocationValid([], '1000')).toBe(false);
  });
  it('rejects when the sum exceeds the payment amount', () => {
    expect(isManualAllocationValid([{ billInvoiceId: 'a', amount: '1200' }], '1000')).toBe(false);
  });
  it('accepts when the sum is under the payment amount (leftover becomes advance credit)', () => {
    expect(isManualAllocationValid([{ billInvoiceId: 'a', amount: '800' }], '1000')).toBe(true);
  });
  it('accepts when the sum exactly equals the payment amount', () => {
    expect(isManualAllocationValid([{ billInvoiceId: 'a', amount: '1000' }], '1000')).toBe(true);
  });
});

const baseFields = {
  studentId: 'student-1',
  academicYearId: 'year-1',
  amount: '1000',
  method: 'CASH' as const,
  allocationMode: 'AUTO_FIFO' as const,
  targets: [],
  chequeBank: '',
  chequeDate: '',
  reference: '',
};

describe('canSubmitBillPayment', () => {
  it('allows a valid CASH/AUTO_FIFO payment', () => {
    expect(canSubmitBillPayment(baseFields)).toBe(true);
  });
  it('rejects a missing student', () => {
    expect(canSubmitBillPayment({ ...baseFields, studentId: '' })).toBe(false);
  });
  it('rejects a zero/blank amount', () => {
    expect(canSubmitBillPayment({ ...baseFields, amount: '' })).toBe(false);
    expect(canSubmitBillPayment({ ...baseFields, amount: '0' })).toBe(false);
  });
  it('rejects CHEQUE without bank, date, and reference (cheque number)', () => {
    expect(canSubmitBillPayment({ ...baseFields, method: 'CHEQUE' })).toBe(false);
  });
  it('rejects CHEQUE with bank and date but no reference — BillPaymentService requires all three', () => {
    expect(canSubmitBillPayment({ ...baseFields, method: 'CHEQUE', chequeBank: 'NIC Asia', chequeDate: '2026-08-01' })).toBe(false);
  });
  it('allows CHEQUE once bank, date, and reference are all set', () => {
    expect(canSubmitBillPayment({ ...baseFields, method: 'CHEQUE', chequeBank: 'NIC Asia', chequeDate: '2026-08-01', reference: 'CHQ-001' })).toBe(true);
  });
  it('rejects MANUAL with no valid targets', () => {
    expect(canSubmitBillPayment({ ...baseFields, allocationMode: 'MANUAL', targets: [] })).toBe(false);
  });
  it('allows MANUAL once targets sum within the amount', () => {
    expect(canSubmitBillPayment({ ...baseFields, allocationMode: 'MANUAL', targets: [{ billInvoiceId: 'a', amount: '600' }] })).toBe(true);
  });
  it('allows ADVANCE_ONLY with no targets at all', () => {
    expect(canSubmitBillPayment({ ...baseFields, allocationMode: 'ADVANCE_ONLY', targets: [] })).toBe(true);
  });
});

// Srijan's ruling: a money-moving submit needs a confirmation naming the
// amount, method, student, and what it settles — same standard as UI-3's
// bill-run Post confirmation. Pinned as its own tested function since the
// three allocation modes produce genuinely different content, not a
// one-line ternary like UI-3's.
describe('buildPaymentConfirmationText', () => {
  it('names amount, method, and student for AUTO_FIFO, and describes oldest-first settlement', () => {
    const text = buildPaymentConfirmationText({
      studentName: 'Aarav Sharma',
      amount: '3000',
      method: 'CASH',
      allocationMode: 'AUTO_FIFO',
      manualAllocations: [],
    });
    expect(text).toContain('Aarav Sharma');
    expect(text).toContain('CASH');
    expect(text).toContain('Rs. 3,000');
    expect(text).toMatch(/oldest/i);
  });

  it('lists each targeted invoice and amount for MANUAL', () => {
    const text = buildPaymentConfirmationText({
      studentName: 'Binod Gurung',
      amount: '2000',
      method: 'CASH',
      allocationMode: 'MANUAL',
      manualAllocations: [{ invoiceNumber: 'BINV-2083-000005', amount: '2000' }],
    });
    expect(text).toContain('BINV-2083-000005');
    expect(text).toContain('Rs. 2,000');
  });

  it('states no invoice is settled for ADVANCE_ONLY', () => {
    const text = buildPaymentConfirmationText({
      studentName: 'Ishwor Basnet',
      amount: '1500',
      method: 'CASH',
      allocationMode: 'ADVANCE_ONLY',
      manualAllocations: [],
    });
    expect(text).toMatch(/advance credit/i);
    expect(text).toMatch(/no invoice/i);
  });

  it('always states the action is permanent (only voidable, not editable)', () => {
    const text = buildPaymentConfirmationText({
      studentName: 'X',
      amount: '100',
      method: 'CASH',
      allocationMode: 'AUTO_FIFO',
      manualAllocations: [],
    });
    expect(text).toMatch(/void/i);
  });
});
