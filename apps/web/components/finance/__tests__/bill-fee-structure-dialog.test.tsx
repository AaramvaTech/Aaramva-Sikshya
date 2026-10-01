// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { BillFeeStructureDialog } from '../bill-fee-structure-dialog';

const updateItems = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
vi.mock('@/lib/hooks/use-bill-catalog', () => ({
  useCreateFeeStructure: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateFeeStructureItems: () => updateItems,
  useFeeHeads: () => ({ data: [{ id: 'fh1', name: 'Tuition' }] }),
}));
vi.mock('@/lib/hooks/use-students', () => ({
  useClasses: () => ({ data: [{ id: 'c1', name: 'Grade 6', sections: [] }] }),
  useAcademicYears: () => ({ data: [] }),
}));

const structure = {
  id: 's1', classId: 'c1', academicYearId: 'y1', sectionId: null, name: 'Grade 6 2083',
  items: [{ feeHeadId: 'fh1', amount: 1000, effectiveFrom: '2026-07-17', effectiveTo: null }],
} as never;

afterEach(() => cleanup());

describe('BillFeeStructureDialog — recurrence override is gone', () => {
  it('has no Recurrence Override input', () => {
    render(<BillFeeStructureDialog open onOpenChange={vi.fn()} mode="edit" structure={structure} />);
    expect(screen.queryByText(/Recurrence Override/i)).toBeNull();
  });

  it('an edit still saves the whole item set, and the payload carries no recurrenceOverride', async () => {
    render(<BillFeeStructureDialog open onOpenChange={vi.fn()} mode="edit" structure={structure} />);
    fireEvent.click(screen.getByRole('button', { name: /save|update/i }));
    await waitFor(() => expect(updateItems.mutateAsync).toHaveBeenCalled());
    const { data } = updateItems.mutateAsync.mock.calls[0][0];
    expect(data.items).toEqual([{ feeHeadId: 'fh1', amount: '1000.00', effectiveFrom: '2026-07-17', effectiveTo: undefined }]);
    expect('recurrenceOverride' in data.items[0]).toBe(false);
  });
});
