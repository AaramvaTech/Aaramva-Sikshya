// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import FeeCatalogPage from '../page';

const head = (over: Record<string, unknown>) => ({
  id: 'h', name: 'Tuition', code: 'TUI', recurrence: 'MONTHLY', isTaxable: false, isRefundable: false,
  prorationPolicy: 'NONE', glAccountCode: null, isActive: true, ...over,
});
const mut = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };

vi.mock('@/lib/hooks/use-bill-catalog', () => ({
  useFeeHeads: () => ({
    data: [head({ id: 'a', name: 'Lab', isTaxable: true }), head({ id: 'b', name: 'Tuition' })],
    isLoading: false,
  }),
  useCreateFeeHead: () => mut, useUpdateFeeHead: () => mut, useDeleteFeeHead: () => mut,
  useTaxRates: () => ({ data: [], isLoading: false }),
  useCreateTaxRate: () => mut, useUpdateTaxRate: () => mut, useDeleteTaxRate: () => mut,
}));

afterEach(() => cleanup());

describe('Fee Heads — VAT caption (UI-HINTS)', () => {
  it('shows "VAT is set under Tax Rates" only on the taxable head', () => {
    render(<FeeCatalogPage />);
    expect(screen.getAllByText(/^VAT is set under/)).toHaveLength(1);
  });

  it('the Tax Rates link switches to the Tax Rates tab', () => {
    render(<FeeCatalogPage />);
    fireEvent.click(screen.getByText(/^VAT is set under/).querySelector('button')!);
    expect(screen.queryByText(/^VAT is set under/)).toBeNull();
    expect(screen.getByText('No tax rates yet. Add one above.')).toBeTruthy();
  });
});
