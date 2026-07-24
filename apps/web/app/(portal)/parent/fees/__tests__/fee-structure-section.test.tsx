// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useStudentAssignments } from '@/lib/hooks/use-finance';
import { FeeStructureSection } from '../page';

// Bug found live in the parent portal (2026-07-24): the backend's
// getStudentFeeAssignments (apps/api/src/modules/finance/invoice.service.ts)
// returns objects shaped { feeStructureItemId, feeCategoryName, ... } --
// there has never been an `id` field on this response. The frontend
// FeeAssignment type incorrectly declared a phantom `id: string`, and this
// section's list keyed on `a.id`, which is `undefined` for every row --
// React's "Each child in a list should have a unique key prop" warning.
// The admin equivalent (students/[id]/page.tsx's AssignmentRow list) already
// correctly keys on `feeStructureItemId`; this test pins the parent screen
// to that same, actually-correct field.

vi.mock('@/lib/hooks/use-finance', () => ({
  useStudentAssignments: vi.fn(),
}));

const mockUseStudentAssignments = useStudentAssignments as unknown as ReturnType<typeof vi.fn>;

const ASSIGNMENTS = [
  {
    feeStructureItemId: 'fsi-1',
    feeCategoryName: 'Tuition',
    originalAmount: 5000,
    customAmount: null,
    discountPercent: 0,
    discountReason: null,
    isWaived: false,
    effectiveAmount: 5000,
  },
  {
    feeStructureItemId: 'fsi-2',
    feeCategoryName: 'Transport',
    originalAmount: 1500,
    customAmount: null,
    discountPercent: 0,
    discountReason: null,
    isWaived: false,
    effectiveAmount: 1500,
  },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('FeeStructureSection — key prop (live bug fix)', () => {
  it('renders every assignment without a React "unique key" warning, using the real API shape (no id field)', () => {
    mockUseStudentAssignments.mockReturnValue({
      data: ASSIGNMENTS,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<FeeStructureSection studentId="student-1" academicYearId="ay-1" />);

    expect(screen.getByText('Tuition')).not.toBeNull();
    expect(screen.getByText('Transport')).not.toBeNull();

    const keyWarning = errorSpy.mock.calls.some((call) =>
      String(call[0]).includes('unique "key" prop'),
    );
    expect(keyWarning).toBe(false);
  });
});
