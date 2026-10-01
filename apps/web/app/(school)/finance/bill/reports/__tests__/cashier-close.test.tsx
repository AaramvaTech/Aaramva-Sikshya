// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { CashierTab } from '../page';
import { useCashierShifts, useOpenShift, useCloseShift, useOutsideShiftCash } from '@/lib/hooks/use-cashier';
import { useCurrentAcademicYear } from '@/lib/hooks/use-students';

vi.mock('@/lib/hooks/use-cashier', () => ({
  useCashierShifts: vi.fn(), useOpenShift: vi.fn(), useCloseShift: vi.fn(), useOutsideShiftCash: vi.fn(),
}));
vi.mock('@/lib/hooks/use-reports', () => ({}));
vi.mock('@/lib/hooks/use-bill-assignment', () => ({}));
vi.mock('@/lib/hooks/use-bill-payment', () => ({}));
vi.mock('@/lib/hooks/use-bill-catalog', () => ({}));
vi.mock('@/lib/hooks/use-academic', () => ({}));
vi.mock('@/lib/hooks/use-students', () => ({ useCurrentAcademicYear: vi.fn(), useStudents: vi.fn(), useAcademicYears: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const m = (f: unknown) => f as ReturnType<typeof vi.fn>;
const openShift = {
  id: 'shift-1', cashierUserId: 'u1', cashierName: 'Ram', academicYearId: 'y1', openedAt: '2026-09-30T11:00:00.000Z',
  openedBs: { year: 2083, month: 6, day: 14 }, openingFloat: 2000, closedAt: null, closedBy: null, closedByName: null,
  countedCash: null, expectedCash: null, variance: null, status: 'OPEN', notes: null,
};
const closeResult = (variance: number) => ({ data: { data: { variance, countedCash: 2000 + variance, expectedCash: 2000, byMethod: [] } } });

function setup(mutateAsync = vi.fn(), outside: unknown = undefined) {
  m(useCashierShifts).mockReturnValue({ data: [openShift], isLoading: false, isError: false, refetch: vi.fn() });
  m(useOpenShift).mockReturnValue({ mutate: vi.fn(), isPending: false });
  m(useCloseShift).mockReturnValue({ mutateAsync, isPending: false });
  m(useOutsideShiftCash).mockReturnValue({ data: outside });
  m(useCurrentAcademicYear).mockReturnValue({ data: { id: 'y1', name: '2083' } });
  render(<CashierTab />);
  return mutateAsync;
}
const typeCounted = (v: string) => fireEvent.change(document.querySelector('input[type="number"]')!, { target: { value: v } });

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('Close shift confirmation', () => {
  it('Close shift is inert until a count is typed', () => {
    setup();
    fireEvent.click(screen.getAllByRole('button', { name: 'Close shift' })[0]);
    expect(screen.queryByText(/This cannot be undone/)).toBeNull();
  });

  it('opens a confirm naming the counted cash, never the expected amount; Cancel does not close', async () => {
    const close = setup();
    typeCounted('1900');
    fireEvent.click(screen.getAllByRole('button', { name: 'Close shift' })[0]);
    await screen.findByText('Close this shift with counted cash Rs 1,900? This cannot be undone.');
    expect(document.body.textContent).not.toContain('Expected');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(close).not.toHaveBeenCalled();
  });

  it('Confirm closes with the typed count and shows counted/expected/variance (short = warning)', async () => {
    const close = setup(vi.fn().mockResolvedValue(closeResult(-100)));
    typeCounted('1900');
    fireEvent.click(screen.getAllByRole('button', { name: 'Close shift' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(close).toHaveBeenCalledWith({ id: 'shift-1', data: { countedCash: '1900', notes: undefined } }));
    const banner = await screen.findByText(/Shift closed\. Variance -Rs 100 \(short\)/);
    expect(banner.closest('[role="status"]')!.className).toMatch(/warning/);
    expect(screen.getByText(/Counted: Rs 1,900 · Expected: Rs 2,000/)).toBeTruthy();
  });

  it('exact match is neutral', async () => {
    setup(vi.fn().mockResolvedValue(closeResult(0)));
    typeCounted('2000');
    fireEvent.click(screen.getAllByRole('button', { name: 'Close shift' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    const banner = await screen.findByText('Shift closed. Variance Rs 0');
    expect(banner.closest('[role="status"]')!.className).not.toMatch(/warning/);
  });

  it('over shows +Rs and is a warning', async () => {
    setup(vi.fn().mockResolvedValue(closeResult(50)));
    typeCounted('2050');
    fireEvent.click(screen.getAllByRole('button', { name: 'Close shift' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    const banner = await screen.findByText(/Shift closed\. Variance \+Rs 50 \(over\)/);
    expect(banner.closest('[role="status"]')!.className).toMatch(/warning/);
  });
});

describe('Outside-shift cash line', () => {
  it('shows total and payment count', () => {
    setup(vi.fn(), { date: '2026-09-30', total: 5390, count: 3, payments: [] });
    expect(screen.getByText('Cash received outside any shift today: Rs 5,390 (3 payments)')).toBeTruthy();
  });
  it('shows nothing when 0', () => {
    setup(vi.fn(), { date: '2026-09-30', total: 0, count: 0, payments: [] });
    expect(screen.queryByText(/outside any shift/)).toBeNull();
  });
});
