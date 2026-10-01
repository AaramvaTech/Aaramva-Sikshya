// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NoShiftWarning } from '../no-shift-warning';
import { useMyOpenShift } from '@/lib/hooks/use-cashier';
import type { BillPaymentMethod } from '@/types/api.types';

vi.mock('@/lib/hooks/use-cashier', () => ({ useMyOpenShift: vi.fn() }));
afterEach(() => cleanup());

const MSG = 'No cash shift is open. This payment will not be counted in any shift.';
function show(method: BillPaymentMethod, q: { isLoading?: boolean; isError?: boolean; data?: unknown }) {
  (useMyOpenShift as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ isLoading: false, isError: false, data: null, ...q });
  render(<NoShiftWarning method={method} />);
}

describe('NoShiftWarning', () => {
  it('shows for CASH with no open shift', () => { show('CASH', {}); expect(screen.getByText(MSG)).toBeTruthy(); });
  it('hidden for CASH with an open shift', () => { show('CASH', { data: { id: 's1' } }); expect(screen.queryByText(MSG)).toBeNull(); });
  it('hidden for non-CASH methods', () => { show('CHEQUE', {}); expect(screen.queryByText(MSG)).toBeNull(); });
  it('hidden while the lookup is loading', () => { show('CASH', { isLoading: true, data: undefined }); expect(screen.queryByText(MSG)).toBeNull(); });
});
