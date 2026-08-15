import { describe, it, expect } from 'vitest';
import { sumInvoiceTotals } from '../invoice-totals';
import type { BillInvoice } from '@/types/api.types';

function invoice(overrides: Partial<BillInvoice>): BillInvoice {
  return {
    id: 'x', invoiceNumber: 'BINV-1', studentId: 's', academicYearId: 'y', billRunId: 'r',
    bsYear: 2083, bsMonth: 1, issueDate: '2026-07-26', dueDate: '2026-08-10',
    grossAmount: 0, concessionAmount: 0, taxableBase: 0, taxRate: null, taxAmount: 0,
    netAmount: 0, previousBalance: 0, totalReceivable: 0, paidAmount: 0, balance: 0,
    amountInWordsEn: null, amountInWordsNe: null, status: 'POSTED', ledgerEntryId: null,
    createdBy: 'u', createdAt: '2026-07-26T00:00:00Z',
    ...overrides,
  };
}

describe('sumInvoiceTotals', () => {
  it('returns zero for an empty invoice list', () => {
    expect(sumInvoiceTotals([])).toEqual({ totalInvoiced: 0, totalPaid: 0 });
  });

  it('sums netAmount/paidAmount, matching live-proved demo data (BILLING-CUTOVER Phase 1)', () => {
    // Real demo fixture: Binod Gurung, 2026-08-14 — BINV-2083-000003 (netAmount
    // 1000, paidAmount 1000) + BINV-2083-000005 (netAmount 2260, paidAmount 0).
    const invoices = [
      invoice({ netAmount: 1000, totalReceivable: 1000, paidAmount: 1000, balance: 0 }),
      invoice({ netAmount: 2260, totalReceivable: 3260, previousBalance: 1000, paidAmount: 0, balance: 3260 }),
    ];
    expect(sumInvoiceTotals(invoices)).toEqual({ totalInvoiced: 3260, totalPaid: 1000 });
  });

  it('does not double-count carried-forward previousBalance via totalReceivable/balance', () => {
    // If this ever summed totalReceivable instead of netAmount it would read
    // 1000 + 3260 = 4260 here, not the true 3260 — the exact double-counting
    // trap this helper's own docblock exists to avoid.
    const invoices = [
      invoice({ netAmount: 1000, totalReceivable: 1000 }),
      invoice({ netAmount: 2260, totalReceivable: 3260, previousBalance: 1000 }),
    ];
    expect(sumInvoiceTotals(invoices).totalInvoiced).toBe(3260);
  });
});
