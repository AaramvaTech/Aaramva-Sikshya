// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useSelectedChild } from '@/lib/hooks/use-selected-child';
import { ChildSwitcher } from '../child-switcher';

vi.mock('@/lib/hooks/use-selected-child', () => ({
  useSelectedChild: vi.fn(),
}));

const mockUseSelectedChild = useSelectedChild as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  cleanup();
});

describe('ChildSwitcher — long-name truncation (WEB-P UI/UX pass)', () => {
  it('truncates a long single-child name behind a title tooltip instead of overflowing', () => {
    mockUseSelectedChild.mockReturnValue({
      children: [{ id: 'c1', firstName: 'Aishwarya-Kumari', lastName: 'Bahadur-Shrestha-Thapa' }],
      selectedChildId: 'c1',
      setSelectedChild: vi.fn(),
      isLoading: false,
    });

    render(<ChildSwitcher />);

    const label = screen.getByText('Aishwarya-Kumari Bahadur-Shrestha-Thapa');
    expect(label.className).toContain('truncate');
    expect(label.getAttribute('title')).toBe('Aishwarya-Kumari Bahadur-Shrestha-Thapa');
  });

  it('widens the trigger and exposes the full name via title when multiple children exist', () => {
    mockUseSelectedChild.mockReturnValue({
      children: [
        { id: 'c1', firstName: 'Aishwarya-Kumari', lastName: 'Bahadur-Shrestha-Thapa' },
        { id: 'c2', firstName: 'Ravi', lastName: 'Thapa' },
      ],
      selectedChildId: 'c1',
      setSelectedChild: vi.fn(),
      isLoading: false,
    });

    render(<ChildSwitcher />);

    const trigger = document.querySelector('[data-slot="select-trigger"]') as HTMLElement;
    expect(trigger).not.toBeNull();
    expect(trigger.className).toContain('w-56');
    expect(trigger.getAttribute('title')).toBe('Aishwarya-Kumari Bahadur-Shrestha-Thapa');
    expect(screen.getByText('Aishwarya-Kumari Bahadur-Shrestha-Thapa').className).toContain('truncate');
  });
});
