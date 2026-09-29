import { describe, it, expect } from 'vitest';
import { allocationLabel } from '@/lib/allocation-label';

describe('allocationLabel', () => {
  it('shows the invoice number, not the uuid tail', () => {
    expect(allocationLabel({ billInvoiceId: '97e01f91-7e1e-4d9b-9dda-e7f5d72f32bc', billFineAccrualId: null, invoiceNumber: 'BINV-2083-000068' }))
      .toBe('Invoice BINV-2083-000068');
  });
  it('falls back to the id tail when no number came back', () => {
    expect(allocationLabel({ billInvoiceId: '97e01f91-7e1e-4d9b-9dda-e7f5d72f32bc', billFineAccrualId: null, invoiceNumber: null }))
      .toBe('Invoice …d72f32bc');
  });
  it('labels a fine allocation', () => {
    expect(allocationLabel({ billInvoiceId: null, billFineAccrualId: 'aaaaaaaa-0000-0000-0000-00000000beef', invoiceNumber: null }))
      .toBe('Late fee …0000beef');
  });
});
