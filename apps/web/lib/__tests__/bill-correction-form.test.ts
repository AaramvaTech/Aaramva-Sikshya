import { describe, it, expect } from 'vitest';
import {
  sumApprovedCorrectionsForInvoice,
  sumApprovedCorrectionsForItem,
  creditNoteCapPreview,
  refundCapPreview,
  writeOffCapPreview,
  canSubmitCorrection,
  canSubmitDecision,
} from '../bill-correction-form';

// UI-5-SPEC.md §3.2/§3.4 — pure gating + cap-preview functions for the
// New Correction page and the decide dialog.

const corrections = [
  { type: 'CREDIT_NOTE' as const, targetInvoiceId: 'inv-1', targetInvoiceItemId: null, amount: 500 },
  { type: 'WRITE_OFF' as const, targetInvoiceId: 'inv-1', targetInvoiceItemId: 'item-1', amount: 200 },
  { type: 'REFUND' as const, targetInvoiceId: null, targetInvoiceItemId: null, amount: 999 },
  { type: 'CREDIT_NOTE' as const, targetInvoiceId: 'inv-2', targetInvoiceItemId: null, amount: 100 },
];

describe('sumApprovedCorrectionsForInvoice', () => {
  it('sums CREDIT_NOTE + WRITE_OFF against the invoice, including item-scoped rows — matches creditableAmount', () => {
    expect(sumApprovedCorrectionsForInvoice(corrections, 'inv-1')).toBe(700);
  });
  it('ignores REFUND rows (not a credit against an invoice) and other invoices', () => {
    expect(sumApprovedCorrectionsForInvoice(corrections, 'inv-2')).toBe(100);
    expect(sumApprovedCorrectionsForInvoice(corrections, 'inv-3')).toBe(0);
  });
});

describe('sumApprovedCorrectionsForItem', () => {
  it('sums only rows scoped to the exact line, not the whole-invoice credit', () => {
    expect(sumApprovedCorrectionsForItem(corrections, 'item-1')).toBe(200);
    expect(sumApprovedCorrectionsForItem(corrections, 'item-2')).toBe(0);
  });
});

describe('creditNoteCapPreview', () => {
  it('subtracts prior credited amount from the base', () => {
    expect(creditNoteCapPreview(1000, 300)).toBe(700);
  });
  it('never goes negative when prior credits exceed the base (stale data)', () => {
    expect(creditNoteCapPreview(100, 300)).toBe(0);
  });
});

describe('refundCapPreview', () => {
  it('returns the balance when the student is in ADVANCE', () => {
    expect(refundCapPreview(1500, 'ADVANCE')).toBe(1500);
  });
  it('returns 0 when the student OWES or is ZERO — no advance credit to refund', () => {
    expect(refundCapPreview(1500, 'OWES')).toBe(0);
    expect(refundCapPreview(0, 'ZERO')).toBe(0);
  });
});

describe('writeOffCapPreview', () => {
  it('caps at the invoice outstanding-after-credits when an invoice target is given', () => {
    expect(writeOffCapPreview({ balance: 1000, priorApprovedCredited: 400 }, 5000, 'OWES')).toBe(600);
  });
  it('falls back to the overall owed balance when no invoice target is given', () => {
    expect(writeOffCapPreview(null, 3000, 'OWES')).toBe(3000);
  });
  it('caps a balance-level write-off at 0 when the student does not owe', () => {
    expect(writeOffCapPreview(null, 1500, 'ADVANCE')).toBe(0);
  });
});

describe('canSubmitCorrection', () => {
  const base = { studentId: 's-1', academicYearId: 'y-1', amount: '1000', reasonId: 'r-1' };

  it('CREDIT_NOTE requires a target invoice', () => {
    expect(canSubmitCorrection('CREDIT_NOTE', { ...base, targetInvoiceId: 'inv-1' })).toBe(true);
    expect(canSubmitCorrection('CREDIT_NOTE', { ...base, targetInvoiceId: '' })).toBe(false);
  });

  it('REFUND requires a reference when BANK_TRANSFER, not when CASH', () => {
    expect(canSubmitCorrection('REFUND', { ...base, refundMethod: 'BANK_TRANSFER', refundReference: '' })).toBe(false);
    expect(canSubmitCorrection('REFUND', { ...base, refundMethod: 'BANK_TRANSFER', refundReference: 'TXN-1' })).toBe(true);
    expect(canSubmitCorrection('REFUND', { ...base, refundMethod: 'CASH', refundReference: '' })).toBe(true);
  });

  it('WRITE_OFF allows an omitted target invoice (balance-level)', () => {
    expect(canSubmitCorrection('WRITE_OFF', { ...base, targetInvoiceId: '' })).toBe(true);
  });

  it('rejects a zero/blank amount or missing reason across all types', () => {
    expect(canSubmitCorrection('WRITE_OFF', { ...base, amount: '0', targetInvoiceId: '' })).toBe(false);
    expect(canSubmitCorrection('WRITE_OFF', { ...base, reasonId: '', targetInvoiceId: '' })).toBe(false);
  });
});

describe('canSubmitDecision', () => {
  it('requires a non-empty, non-whitespace note to reject', () => {
    expect(canSubmitDecision('reject', '')).toBe(false);
    expect(canSubmitDecision('reject', '   ')).toBe(false);
    expect(canSubmitDecision('reject', 'Duplicate request')).toBe(true);
  });
  it('never requires a note to approve', () => {
    expect(canSubmitDecision('approve', '')).toBe(true);
  });
});
