// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CorrectionTypeBadge } from '../correction-type-badge';

afterEach(() => cleanup());

describe('CorrectionTypeBadge', () => {
  it('renders CREDIT_NOTE as "Credit Note", brand-colored', () => {
    render(<CorrectionTypeBadge type="CREDIT_NOTE" />);
    const badge = screen.getByText('Credit Note');
    expect(badge.className).toMatch(/brand/);
  });

  it('renders REFUND as "Refund", blue', () => {
    render(<CorrectionTypeBadge type="REFUND" />);
    const badge = screen.getByText('Refund');
    expect(badge.className).toMatch(/blue/);
  });

  it('renders WRITE_OFF as "Write-off", violet — distinct from the other two', () => {
    render(<CorrectionTypeBadge type="WRITE_OFF" />);
    const badge = screen.getByText('Write-off');
    expect(badge.className).toMatch(/violet/);
  });
});
