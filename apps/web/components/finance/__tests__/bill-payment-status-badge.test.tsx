// @vitest-environment jsdom
//
// No @testing-library/jest-dom in this project (not installed) — assertions
// use plain vitest matchers against getByText results, not `.toBeInTheDocument()`
// (established convention, see config-section.test.tsx / bill-run-outcome-badge.test.tsx).
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BillPaymentStatusBadge } from '../bill-payment-status-badge';

afterEach(() => cleanup());

describe('BillPaymentStatusBadge', () => {
  it('renders CLEARED as green', () => {
    render(<BillPaymentStatusBadge status="CLEARED" />);
    const badge = screen.getByText('Cleared');
    expect(badge.className).toMatch(/success/);
  });

  it('renders PENDING as amber — a promise, not money yet', () => {
    render(<BillPaymentStatusBadge status="PENDING" />);
    const badge = screen.getByText('Pending');
    expect(badge.className).toMatch(/warning|amber|yellow/);
  });

  it('renders BOUNCED as red', () => {
    render(<BillPaymentStatusBadge status="BOUNCED" />);
    const badge = screen.getByText('Bounced');
    expect(badge.className).toMatch(/error|red/);
  });

  it('renders VOIDED as neutral gray, not an error color', () => {
    render(<BillPaymentStatusBadge status="VOIDED" />);
    const badge = screen.getByText('Voided');
    expect(badge.className).not.toMatch(/error|red|success|green/);
  });
});
