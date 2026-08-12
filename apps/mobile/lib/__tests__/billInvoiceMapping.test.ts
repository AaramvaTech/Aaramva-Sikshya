import { describe, it, expect } from '@jest/globals';
import {
  mapBillInvoiceStatus,
  mapBillInvoiceToLegacy,
  mapBillInvoicesToLedger,
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
  dueDate: '2026-08-20',
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

  it('maps totalReceivable/paidAmount/balance to the legacy totalAmount/paidAmount/balance fields', () => {
    const inv = mapBillInvoiceToLegacy(baseApiInvoice, NOW);
    expect(inv.totalAmount).toBe(5000);
    expect(inv.paidAmount).toBe(1500);
    expect(inv.balance).toBe(3500);
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
  const settled: BillInvoiceApi = { ...baseApiInvoice, id: 'bi-2', status: 'SETTLED', paidAmount: 2000, balance: 0, totalReceivable: 2000 };
  const voided: BillInvoiceApi = { ...baseApiInvoice, id: 'bi-3', status: 'VOIDED', totalReceivable: 9999, paidAmount: 0, balance: 9999 };

  it('filters VOIDED invoices out entirely (ruled: a voided invoice was never really billed)', () => {
    const ledger = mapBillInvoicesToLedger('student-1', 'year-1', [baseApiInvoice, settled, voided], NOW);
    expect(ledger.invoices.map((i) => i.id)).toEqual(['bi-1', 'bi-2']);
  });

  it('sums summary.totalInvoiced/totalPaid/totalBalance across the surviving (non-VOIDED) invoices only', () => {
    const ledger = mapBillInvoicesToLedger('student-1', 'year-1', [baseApiInvoice, settled, voided], NOW);
    expect(ledger.summary.totalInvoiced).toBe(7000); // 5000 + 2000, VOIDED's 9999 excluded
    expect(ledger.summary.totalPaid).toBe(3500); // 1500 + 2000
    expect(ledger.summary.totalBalance).toBe(3500); // 3500 + 0
  });

  it('returns an empty invoices array and zeroed summary for no invoices', () => {
    const ledger = mapBillInvoicesToLedger('student-1', 'year-1', [], NOW);
    expect(ledger.invoices).toEqual([]);
    expect(ledger.summary).toEqual({ totalInvoiced: 0, totalPaid: 0, totalBalance: 0 });
  });
});
