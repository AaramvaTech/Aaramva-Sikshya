// @vitest-environment jsdom
//
// No @testing-library/jest-dom in this project (not installed) — assertions
// use plain vitest matchers against getByText/queryByText results instead of
// `.toBeInTheDocument()` (established convention, see config-section.test.tsx).
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BillRunOutcomeBadge } from '../bill-run-outcome-badge';

// UI-3-SPEC.md §6 — pins the six outcome states to distinct labels, and
// specifically that the two SKIPPED_* states read as neutral (not red) while
// FAILED reads as red — the "a skip isn't an error" distinction Srijan's
// ruling called out by name.

afterEach(() => cleanup());

describe('BillRunOutcomeBadge', () => {
  it('renders DRAFT as "Will be charged"', () => {
    render(<BillRunOutcomeBadge outcome="DRAFT" />);
    expect(screen.getByText('Will be charged')).toBeTruthy();
  });

  it('renders POSTED as "Charged"', () => {
    render(<BillRunOutcomeBadge outcome="POSTED" />);
    expect(screen.getByText('Charged')).toBeTruthy();
  });

  it('renders SKIPPED_NO_ASSIGNMENT as "No fee assigned", neutral (not red)', () => {
    render(<BillRunOutcomeBadge outcome="SKIPPED_NO_ASSIGNMENT" />);
    const badge = screen.getByText('No fee assigned');
    expect(badge.className).not.toMatch(/error|red/);
  });

  it('renders SKIPPED_ALREADY_BILLED as "Already billed", neutral (not red)', () => {
    render(<BillRunOutcomeBadge outcome="SKIPPED_ALREADY_BILLED" />);
    const badge = screen.getByText('Already billed');
    expect(badge.className).not.toMatch(/error|red/);
  });

  it('renders EXCLUDED as "Excluded", distinct from both neutral skips and red failure', () => {
    render(<BillRunOutcomeBadge outcome="EXCLUDED" />);
    const badge = screen.getByText('Excluded');
    expect(badge.className).not.toMatch(/error|red|gray/);
  });

  it('renders FAILED as "Failed", red', () => {
    render(<BillRunOutcomeBadge outcome="FAILED" />);
    const badge = screen.getByText('Failed');
    expect(badge.className).toMatch(/error|red/);
  });

  it('shows the skip reason as a caption when given', () => {
    render(<BillRunOutcomeBadge outcome="SKIPPED_NO_ASSIGNMENT" skipReason="No active fee structure assignment for this student in the given academic year" />);
    expect(screen.getByText(/No active fee structure assignment/)).toBeTruthy();
  });

  it('shows no caption when skipReason is null', () => {
    const { container } = render(<BillRunOutcomeBadge outcome="DRAFT" skipReason={null} />);
    expect(container.querySelectorAll('p').length).toBe(0);
  });
});
