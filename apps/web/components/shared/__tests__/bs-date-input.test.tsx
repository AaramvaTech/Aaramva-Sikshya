// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { todayBs } from 'bs-calendar';
import { BsDateInput } from '../bs-date-input';

afterEach(() => cleanup());

describe('BsDateInput', () => {
  it('year dropdown offers the current BS year and the next one (was capped at today-2 = 2081)', async () => {
    render(<BsDateInput onChange={() => {}} />);
    fireEvent.click(screen.getAllByRole('combobox')[0]);
    const listbox = await screen.findByRole('listbox');
    const offered = within(listbox).getAllByRole('option').map((o) => Number(o.textContent));
    const y = todayBs().year;
    expect(offered).toContain(y);
    expect(offered).toContain(y + 1);
  });

  it('shows a value that is SET after mount (form default), and clears again on reset', () => {
    const shown = () => screen.getAllByRole('combobox').map((c) => c.textContent?.replace('▼', '').trim());
    const { rerender } = render(<BsDateInput value="" onChange={() => {}} />);
    expect(shown()).toEqual(['Year', 'Month', 'Day']);
    rerender(<BsDateInput value="2026-07-17" onChange={() => {}} />);
    expect(shown()).toEqual(['2083', 'Shrawan', '1']);
    rerender(<BsDateInput value="" onChange={() => {}} />);
    expect(shown()).toEqual(['Year', 'Month', 'Day']);
  });

  // jsdom has no layout, so overlap itself can't be measured here — this pins the
  // structure that prevents it: only the month box may shrink, the year/day boxes keep
  // a fixed width, so a narrow container squeezes one box instead of overlapping three.
  it('only the month box shrinks (min-w-0); year and day keep a fixed width', () => {
    render(<BsDateInput onChange={() => {}} />);
    const [year, month, day] = screen.getAllByRole('combobox');
    expect(month.className).toContain('min-w-0');
    expect(year.className).toMatch(/w-\[84px\].*shrink-0|shrink-0.*w-\[84px\]/);
    expect(day.className).toMatch(/w-\[64px\].*shrink-0|shrink-0.*w-\[64px\]/);
  });
});
