import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression: the Record Payment counter listed only status=POSTED, so an
// invoice dropped off it after its first partial payment (PARTIALLY_PAID) and
// the remaining balance could no longer be collected there.

vi.mock('@/lib/api/bill-invoice.api', () => ({ billInvoiceApi: { list: vi.fn() } }));
vi.mock('@/lib/api/bill-payment.api', () => ({ billPaymentApi: {} }));

import { billInvoiceApi } from '@/lib/api/bill-invoice.api';
import { fetchOutstandingInvoices } from '@/lib/hooks/use-bill-payment';

const mockList = billInvoiceApi.list as unknown as ReturnType<typeof vi.fn>;
const inv = (invoiceNumber: string, status: string, issueDate: string, balance: number) => ({
  id: invoiceNumber, invoiceNumber, status, issueDate, balance,
});
const page = (rows: unknown[]) => ({ data: { data: { data: rows } } });

describe('fetchOutstandingInvoices', () => {
  beforeEach(() => { mockList.mockReset(); });

  it('includes PARTIALLY_PAID invoices, not just POSTED', async () => {
    mockList.mockImplementation(async ({ status }: { status: string }) =>
      page(status === 'PARTIALLY_PAID' ? [inv('BINV-2083-000068', 'PARTIALLY_PAID', '2026-09-29', 1130)] : []));

    const rows = await fetchOutstandingInvoices('student-1');

    expect(rows.map((r) => r.invoiceNumber)).toEqual(['BINV-2083-000068']);
    expect(rows[0].balance).toBe(1130);
  });

  it('merges both statuses oldest-first and never asks for SETTLED/VOIDED', async () => {
    mockList.mockImplementation(async ({ status }: { status: string }) =>
      page(status === 'POSTED'
        ? [inv('BINV-2083-000070', 'POSTED', '2026-09-29', 500)]
        : [inv('BINV-2083-000060', 'PARTIALLY_PAID', '2026-08-10', 300)]));

    const rows = await fetchOutstandingInvoices('student-1');

    expect(rows.map((r) => r.invoiceNumber)).toEqual(['BINV-2083-000060', 'BINV-2083-000070']);
    const statuses = mockList.mock.calls.map((c) => c[0].status).sort();
    expect(statuses).toEqual(['PARTIALLY_PAID', 'POSTED']);
  });
});
