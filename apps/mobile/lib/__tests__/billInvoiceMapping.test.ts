import { describe, it, expect } from '@jest/globals';
import {
  mapBillInvoiceStatus,
  mapBillInvoiceToLegacy,
  mapBillInvoicesToLedger,
  ownBalanceOf,
  type BillInvoiceApi,
} from '../billInvoiceMapping';

// UI-4 Checkpoint B (PAY-UI-REPOINT-discovery.md §4) — bill_invoices status is
// POSTED | SETTLED | PARTIALLY_PAID | VOIDED; the mobile UI's FEE_STATUS map
// is UNPAID | PARTIAL | PAID | OVERDUE | WAIVED. OVERDUE has no stored flag on
// the new rail (derived: today > due_date); WAIVED has no new-rail analogue
// at all (a waiver is now a BILL-6 credit-note/write-off correction) so this
// mapper never produces it.
const NOW = new Date(2026, 7, 15); // 2026-08-15 local

describe('mapBillInvoiceStatus', () => {
  it('SETTLED -> PAID', () => {
    expect(mapBillInvoiceStatus('SETTLED', '2026-08-01', NOW)).toBe('PAID');
  });
  it('PARTIALLY_PAID -> PARTIAL', () => {
    expect(mapBillInvoiceStatus('PARTIALLY_PAID', '2026-08-01', NOW)).toBe('PARTIAL');
  });
  it('POSTED with a future due date -> UNPAID', () => {
    expect(mapBillInvoiceStatus('POSTED', '2026-08-20', NOW)).toBe('UNPAID');
  });
  it('POSTED due exactly today -> UNPAID, not yet OVERDUE', () => {
    expect(mapBillInvoiceStatus('POSTED', '2026-08-15', NOW)).toBe('UNPAID');
  });
  it('POSTED with a past due date -> OVERDUE', () => {
    expect(mapBillInvoiceStatus('POSTED', '2026-08-01', NOW)).toBe('OVERDUE');
  });
});

const baseApiInvoice: BillInvoiceApi = {
  id: 'bi-1',
  invoiceNumber: 'BINV-2083-000001',
  studentId: 'student-1',
  academicYearId: 'year-1',
  bsYear: 2083,
  bsMonth: 5,
  dueDate: '2026-08-20',
  // BILL-CHECKOUT-1: this invoice's own charge is 3,000; total_receivable is
  // 5,000 because it restates 2,000 of arrears carried from earlier months.
  netAmount: 3000,
  previousBalance: 2000,
  totalReceivable: 5000,
  paidAmount: 1500,
  balance: 3500,
  status: 'PARTIALLY_PAID',
  items: [
    { id: 'item-1', itemName: 'Tuition Fee', grossAmount: 4000, concessionAmount: 0, netAmount: 4000 },
    { id: 'item-2', itemName: 'Transport Fee', grossAmount: 1000, concessionAmount: 0, netAmount: 1000 },
  ],
};

describe('mapBillInvoiceToLegacy', () => {
  it('carries the id through unchanged — this IS the bill_invoices.id the payment-initiate endpoints expect', () => {
    expect(mapBillInvoiceToLegacy(baseApiInvoice, NOW).id).toBe('bi-1');
  });

  it('BILL-CHECKOUT-1: totalAmount is the OWN charge, never total_receivable', () => {
    const inv = mapBillInvoiceToLegacy(baseApiInvoice, NOW);
    expect(inv.totalAmount).toBe(3000); // netAmount, NOT totalReceivable's 5000
    expect(inv.paidAmount).toBe(1500);
    // own charge 3000 - paid 1500. The API's own balance field (3500) is
    // total_receivable-derived and must never reach the Pay button.
    expect(inv.balance).toBe(1500);
  });

  it('BILL-CHECKOUT-1: the carried-forward balance never reaches any card field', () => {
    const inv = mapBillInvoiceToLegacy(baseApiInvoice, NOW);
    expect(inv.totalAmount).not.toBe(baseApiInvoice.totalReceivable);
    expect(inv.balance).not.toBe(baseApiInvoice.balance);
    expect(Object.values(inv)).not.toContain(baseApiInvoice.previousBalance);
  });

  it('BILL-CHECKOUT-1: carries the BS period through for the card heading', () => {
    expect(mapBillInvoiceToLegacy(baseApiInvoice, NOW).period).toEqual({ bsYear: 2083, bsMonth: 5 });
  });

  it('maps status through mapBillInvoiceStatus', () => {
    expect(mapBillInvoiceToLegacy(baseApiInvoice, NOW).status).toBe('PARTIAL');
  });

  it('renames items[].itemName -> feeCategoryName (TRANSPORT-ITEM rename convention)', () => {
    const inv = mapBillInvoiceToLegacy(baseApiInvoice, NOW);
    expect(inv.items?.[0].feeCategoryName).toBe('Tuition Fee');
    expect(inv.items?.[1].feeCategoryName).toBe('Transport Fee');
  });

  it('puts the AD due date string into dueDate.ad', () => {
    expect(mapBillInvoiceToLegacy(baseApiInvoice, NOW).dueDate.ad).toBe('2026-08-20');
  });

  it('falls back invoiceNumber null -> empty string (legacy type is non-nullable)', () => {
    const inv = mapBillInvoiceToLegacy({ ...baseApiInvoice, invoiceNumber: null }, NOW);
    expect(inv.invoiceNumber).toBe('');
  });

  it('reports fineAmount 0 — BILL-7 fines are not exposed on this endpoint (honest limitation, not fabricated)', () => {
    expect(mapBillInvoiceToLegacy(baseApiInvoice, NOW).fineAmount).toBe(0);
  });
});

describe('mapBillInvoicesToLedger', () => {
  const settled: BillInvoiceApi = { ...baseApiInvoice, id: 'bi-2', status: 'SETTLED', netAmount: 2000, previousBalance: 0, paidAmount: 2000, balance: 0, totalReceivable: 2000 };
  const voided: BillInvoiceApi = { ...baseApiInvoice, id: 'bi-3', status: 'VOIDED', netAmount: 9999, previousBalance: 0, totalReceivable: 9999, paidAmount: 0, balance: 9999 };

  it('filters VOIDED invoices out entirely (ruled: a voided invoice was never really billed)', () => {
    const ledger = mapBillInvoicesToLedger('student-1', 'year-1', [baseApiInvoice, settled, voided], NOW);
    expect(ledger.invoices.map((i) => i.id)).toEqual(['bi-1', 'bi-2']);
  });

  it('sums totalInvoiced/totalPaid over OWN charges across the surviving (non-VOIDED) invoices only', () => {
    const ledger = mapBillInvoicesToLedger('student-1', 'year-1', [baseApiInvoice, settled, voided], NOW);
    expect(ledger.summary.totalInvoiced).toBe(5000); // own charges 3000 + 2000; VOIDED excluded
    expect(ledger.summary.totalPaid).toBe(3500); // 1500 + 2000
  });

  it('BILL-CHECKOUT-1: the summary exposes NO balance figure — summing cards double-counts arrears', () => {
    // Ruling 2: mobile adopts the rule apps/web/lib/invoice-totals.ts already
    // states. The field is removed rather than left correct-but-unused, so it
    // cannot be reintroduced by accident.
    const ledger = mapBillInvoicesToLedger('student-1', 'year-1', [baseApiInvoice, settled], NOW);
    expect(ledger.summary).not.toHaveProperty('totalBalance');
    expect(Object.keys(ledger.summary).sort()).toEqual(['totalInvoiced', 'totalPaid']);
  });

  it('returns an empty invoices array and zeroed summary for no invoices', () => {
    const ledger = mapBillInvoicesToLedger('student-1', 'year-1', [], NOW);
    expect(ledger.invoices).toEqual([]);
    expect(ledger.summary).toEqual({ totalInvoiced: 0, totalPaid: 0 });
  });
});

// ─── BILL-CHECKOUT-1 — the defect this ticket exists to close ─────────────────

describe('ownBalanceOf', () => {
  it('is the own charge less what has been paid against it', () => {
    expect(ownBalanceOf({ netAmount: 2260, paidAmount: 0 })).toBe(2260);
    expect(ownBalanceOf({ netAmount: 2260, paidAmount: 260 })).toBe(2000);
  });

  it('floors at zero when allocations exceed the own charge (allocation-cap breach)', () => {
    // BILLING-CALC-AUDIT-1 Ruling 3: 8 of 32 allocations on the dev DB are
    // over-booked like this. A negative Pay button is worse than none.
    expect(ownBalanceOf({ netAmount: 2260, paidAmount: 4260 })).toBe(0);
  });
});

describe('the confirmed overcharge (BILLING-CALC-AUDIT-1 D32)', () => {
  // demo / Aarav Shrestha, 2026-08-12. Two eSewa payments cleared: 4,260
  // against BINV-2083-000004 (own charge 2,260 + 2,000 carried from
  // BINV-2083-000002), then 2,000 against BINV-2083-000002 itself. The
  // student was charged 4,260 and collected 6,260 — a 2,000 overpayment.
  const inv2: BillInvoiceApi = {
    ...baseApiInvoice, id: 'bi-2082-2', invoiceNumber: 'BINV-2083-000002',
    bsYear: 2082, bsMonth: 4, netAmount: 2000, previousBalance: 0,
    totalReceivable: 2000, paidAmount: 0, balance: 2000, status: 'POSTED',
  };
  const inv4: BillInvoiceApi = {
    ...baseApiInvoice, id: 'bi-2082-5', invoiceNumber: 'BINV-2083-000004',
    bsYear: 2082, bsMonth: 5, netAmount: 2260, previousBalance: 2000,
    totalReceivable: 4260, paidAmount: 0, balance: 4260, status: 'POSTED',
  };

  it('the two cards together now ask for exactly what was charged, not the arrears twice', () => {
    const ledger = mapBillInvoicesToLedger('student-1', 'year-1', [inv2, inv4], NOW);
    const askedFor = ledger.invoices.reduce((sum, i) => sum + i.balance, 0);
    expect(askedFor).toBe(4260); // was 6,260 pre-fix (2,000 + 4,260)
    expect(ledger.summary.totalInvoiced).toBe(4260);
  });

  it('the later invoice no longer restates the earlier one', () => {
    const [, later] = mapBillInvoicesToLedger('student-1', 'year-1', [inv2, inv4], NOW).invoices;
    expect(later.balance).toBe(2260); // not 4260
  });
});

describe('itemNames — the card secondary line (BILL-CHECKOUT-1 Phase 3)', () => {
  // The list endpoint returns `itemNames` and NOT `items`. Reading `items`
  // here is what made the secondary line degrade to a bare invoice number on
  // every real list row — found live, not by inspection.
  it('takes itemNames from the list endpoint', () => {
    const inv = mapBillInvoiceToLegacy(
      { ...baseApiInvoice, items: undefined, itemNames: ['Tuition Fee', 'Transport Fee'] },
      NOW,
    );
    expect(inv.itemNames).toEqual(['Tuition Fee', 'Transport Fee']);
  });

  it('falls back to items[].itemName so the single-invoice endpoint renders the same line', () => {
    const inv = mapBillInvoiceToLegacy({ ...baseApiInvoice, itemNames: undefined }, NOW);
    expect(inv.itemNames).toEqual(['Tuition Fee', 'Transport Fee']);
  });

  it('is undefined when the payload carries neither — the line degrades to the invoice number', () => {
    const inv = mapBillInvoiceToLegacy(
      { ...baseApiInvoice, items: undefined, itemNames: undefined },
      NOW,
    );
    expect(inv.itemNames).toBeUndefined();
  });
});
