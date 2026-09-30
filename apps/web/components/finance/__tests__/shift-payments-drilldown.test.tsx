// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { CashierShift } from '@/types/api.types';

// SHIFT-PAYMENTS-WINDOW regression: the drilldown listed payments by calendar
// date via the generic payments list, so receipts from earlier the same day
// showed under a later shift. It must use the server's shift-window endpoint.

vi.mock('@/lib/hooks/use-cashier', () => ({ useShiftPayments: vi.fn() }));
vi.mock('@/lib/hooks/use-bill-payment', () => ({ useBillPayments: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: { get: vi.fn().mockResolvedValue({ data: { data: {} } }) } }));

import { useShiftPayments } from '@/lib/hooks/use-cashier';
import { useBillPayments } from '@/lib/hooks/use-bill-payment';
import { cashierApi } from '@/lib/api/cashier.api';
import api from '@/lib/api';
import { ShiftPaymentsDrilldown } from '../shift-payments-drilldown';

const shift = { id: 'shift-1', cashierUserId: 'c1', openedAt: '2026-09-30T11:13:28Z', closedAt: '2026-09-30T11:17:09Z' } as CashierShift;
const hook = useShiftPayments as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('ShiftPaymentsDrilldown', () => {
  it('asks the shift-window endpoint hook for THIS shift and never the generic payments list', () => {
    hook.mockReturnValue({ isLoading: false, isError: false, data: { payments: [] } });
    render(<ShiftPaymentsDrilldown shift={shift} />);
    expect(hook).toHaveBeenCalledWith('shift-1');
    expect(useBillPayments).not.toHaveBeenCalled();
  });

  it('renders exactly what the server returned, with class/section, without re-filtering', () => {
    hook.mockReturnValue({
      isLoading: false, isError: false,
      data: { payments: [
        { id: 'p14', receiptNumber: 'RCPT-2083-000014', method: 'CASH', amount: 130, receivedDate: '2026-09-30', createdAt: '2026-09-30T11:13:51Z', studentName: 'Sandip Lama', admissionNumber: '2083-0021', className: 'Grade 6', sectionName: 'A' },
        // a non-CASH row is the server's call to include; the client must not drop it
        { id: 'p15', receiptNumber: 'RCPT-2083-000015', method: 'ESEWA', amount: 50, receivedDate: '2026-09-30', createdAt: '2026-09-30T11:14:00Z', studentName: null, admissionNumber: null, className: null, sectionName: null },
      ] },
    });
    render(<ShiftPaymentsDrilldown shift={shift} />);
    expect(screen.getByText('RCPT-2083-000014')).toBeTruthy();
    expect(screen.getByText('RCPT-2083-000015')).toBeTruthy();
    expect(screen.getByText('Grade 6 · A')).toBeTruthy();
    expect(screen.getByText('Sandip Lama')).toBeTruthy();
  });

  it('shows an empty message, not receipts, when the shift window has none', () => {
    hook.mockReturnValue({ isLoading: false, isError: false, data: { payments: [] } });
    render(<ShiftPaymentsDrilldown shift={shift} />);
    expect(screen.getByText('No cleared payments during this shift.')).toBeTruthy();
  });
});

describe('cashierApi.listShiftPayments', () => {
  it('calls GET /finance/cashier/shifts/:id/payments', async () => {
    await cashierApi.listShiftPayments('abc');
    expect((api.get as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('/finance/cashier/shifts/abc/payments');
  });
});
