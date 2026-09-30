import { describe, it, expect } from 'vitest';
import { DATE_PAIR_GRID } from '../create-bill-run-dialog';

describe('New Bill Run — Issue/Due date pair layout', () => {
  it('wraps to one column when two BS pickers (≈17rem each) do not fit, instead of fixed 2 columns', () => {
    expect(DATE_PAIR_GRID).toContain('auto-fit');
    expect(DATE_PAIR_GRID).toContain('minmax(17rem');
    expect(DATE_PAIR_GRID).not.toMatch(/grid-cols-2/);
  });
});
