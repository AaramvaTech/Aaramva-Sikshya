// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import BillingReportsPage, { CashierTab, LISTING_TABS } from '../page';
import { useCashierShifts, useOpenShift, useCloseShift } from '@/lib/hooks/use-cashier';
import { useCurrentAcademicYear } from '@/lib/hooks/use-students';

vi.mock('@/lib/hooks/use-cashier', () => ({
  useCashierShifts: vi.fn(),
  useOpenShift: vi.fn(),
  useCloseShift: vi.fn(),
  useOutsideShiftCash: () => ({ data: undefined }),
}));
const loading = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
vi.mock('@/lib/hooks/use-reports', () => ({
  useDaybook: () => loading, useFinanceDefaulters: () => loading, useCollectionSummary: () => loading,
  useFines: () => loading, useFeeAging: () => loading,
}));
vi.mock('@/lib/hooks/use-bill-assignment', () => ({ useConcessionRegister: () => loading }));
vi.mock('@/lib/hooks/use-bill-payment', () => ({ useStudentStatement: () => loading }));
vi.mock('@/lib/hooks/use-bill-catalog', () => ({ useDiscountReasons: () => ({ data: [] }) }));
vi.mock('@/lib/hooks/use-academic', () => ({ useClasses: () => ({ data: [] }) }));
vi.mock('@/lib/hooks/use-students', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hooks/use-students')>('@/lib/hooks/use-students');
  return { ...actual, useCurrentAcademicYear: vi.fn(), useStudents: () => ({ data: undefined }), useAcademicYears: () => ({ data: [] }) };
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
    expect(screen.getByText(/Cash already in the drawer at the start of your shift, for giving change\. It is not income\./)).toBeTruthy();
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
    expect(screen.getByText(/Count all cash in the drawer, including the opening float\. The expected amount is not shown/)).toBeTruthy();
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

describe('report tab descriptions and Collection range caption (UI-HINTS)', () => {
  const tabs: [string, RegExp][] = [
    ['Daybook', /^One day's ledger movements/],
    ['Defaulters', /^Students with a ledger balance above zero/],
    ['Aging', /^Unpaid invoices grouped by days past/],
    ['Collection', /^Cleared payments over a date range/],
    ['Fines', /^Late fines accrued/],
    ['Concession Register', /^Every concession on record/],
    ['Statement', /^One student's ledger/],
    ['Cashier', /^Open and close your cash shift/],
  ];

  it.each(tabs)('%s tab shows its one-line description (under 90 chars)', (label, re) => {
    mockUseCashierShifts.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    mockUseOpenShift.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockUseCloseShift.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockUseCurrentAcademicYear.mockReturnValue({ data: { id: 'year-1', name: '2083 BS' } });
    render(<BillingReportsPage />);
    fireEvent.click(screen.getByRole('tab', { name: label }));
    const el = screen.getByText(re);
    expect(el.textContent!.length).toBeLessThan(90);
  });

  it('Collection tab states the range it applies', () => {
    render(<BillingReportsPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Collection' }));
    expect(screen.getByText(/^Showing/).textContent).toMatch(/^Showing .+ to .+/);
  });
});
