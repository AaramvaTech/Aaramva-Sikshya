// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CashierTab, LISTING_TABS } from '../page';
import { useCashierShifts, useOpenShift, useCloseShift } from '@/lib/hooks/use-cashier';
import { useCurrentAcademicYear } from '@/lib/hooks/use-students';

vi.mock('@/lib/hooks/use-cashier', () => ({
  useCashierShifts: vi.fn(),
  useOpenShift: vi.fn(),
  useCloseShift: vi.fn(),
}));
vi.mock('@/lib/hooks/use-students', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hooks/use-students')>('@/lib/hooks/use-students');
  return { ...actual, useCurrentAcademicYear: vi.fn() };
});

const mockUseCashierShifts = useCashierShifts as unknown as ReturnType<typeof vi.fn>;
const mockUseOpenShift = useOpenShift as unknown as ReturnType<typeof vi.fn>;
const mockUseCloseShift = useCloseShift as unknown as ReturnType<typeof vi.fn>;
const mockUseCurrentAcademicYear = useCurrentAcademicYear as unknown as ReturnType<typeof vi.fn>;

afterEach(() => cleanup());

function shift(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'shift-1', cashierUserId: 'user-1', cashierName: 'Ram Shrestha', academicYearId: 'year-1',
    openedAt: '2026-07-29T03:00:00.000Z', openedBs: { year: 2083, month: 4, day: 13 },
    openingFloat: 2000, closedAt: null, closedBy: null, closedByName: null,
    countedCash: null, expectedCash: null, variance: null, status: 'OPEN', notes: null,
    ...overrides,
  };
}

// UI-6 spec §6 tier-1 eyeball flag #2 (cashier close variance styling) starts
// here: this pins the *branch*, not the variance colour — variance styling
// itself is a tier-3 visual call.
describe('CashierTab — two-state branch (UI-6 §4.10)', () => {
  it('shows the open-shift form when the caller has no OPEN shift', () => {
    mockUseCashierShifts.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    mockUseOpenShift.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockUseCloseShift.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockUseCurrentAcademicYear.mockReturnValue({ data: { id: 'year-1', name: '2083 BS' } });

    render(<CashierTab />);

    expect(screen.getByRole('button', { name: 'Open shift' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close shift' })).toBeNull();
    expect(screen.getByText('Opening float')).toBeTruthy();
  });

  it('shows the close-shift form when the caller already has an OPEN shift', () => {
    mockUseCashierShifts.mockReturnValue({ data: [shift()], isLoading: false, isError: false, refetch: vi.fn() });
    mockUseOpenShift.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockUseCloseShift.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockUseCurrentAcademicYear.mockReturnValue({ data: { id: 'year-1', name: '2083 BS' } });

    render(<CashierTab />);

    expect(screen.getByRole('button', { name: 'Close shift' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open shift' })).toBeNull();
    expect(screen.getByText('Counted cash')).toBeTruthy();
    expect(screen.getByText(/opening float Rs 2000/)).toBeTruthy();
  });

  it('shift history renders the joined cashierName, not a raw UUID (UI-6 §2.1)', () => {
    mockUseCashierShifts.mockReturnValue({
      data: [shift({ status: 'CLOSED', closedByName: 'Gita KC', variance: 0 })],
      isLoading: false, isError: false, refetch: vi.fn(),
    });
    mockUseOpenShift.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockUseCloseShift.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockUseCurrentAcademicYear.mockReturnValue({ data: { id: 'year-1', name: '2083 BS' } });

    render(<CashierTab />);

    expect(screen.getByText('Ram Shrestha')).toBeTruthy();
    expect(screen.queryByText('user-1')).toBeNull();
  });
});

// Tier-1 eyeball flag #1 (the six-then-two tab grouping) — this pins the
// STRUCTURAL claim (six listing reports, Statement/Cashier are not among
// them) that the visual separator (§4.2) is built against. Whether the
// divider actually *reads* as two groups on screen is tier 3, human-only.
describe('LISTING_TABS — the six-report group (UI-6 §4.2, ruling 3)', () => {
  it('has exactly six entries', () => {
    expect(LISTING_TABS).toHaveLength(6);
  });

  it('does not include Statement or Cashier — those are the two workflow tabs kept visually separate', () => {
    const values = LISTING_TABS.map((t) => t.value);
    expect(values).not.toContain('statement');
    expect(values).not.toContain('cashier');
  });

  it('matches the six BILL-9 listing reports named in the spec', () => {
    expect(LISTING_TABS.map((t) => t.value)).toEqual([
      'daybook', 'defaulters', 'aging', 'collection', 'fines', 'concessions',
    ]);
  });
});
