// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BrandColorPicker, canEditBillingPolicy } from '../page';

afterEach(() => cleanup());

// UI-7 — the curated 8-swatch bill/receipt accent picker (distinct from the
// free-hex web Brand Color already on this page).
describe('BrandColorPicker', () => {
  it('renders all 8 curated swatches in edit mode', () => {
    render(<BrandColorPicker editing value="#475569" onChange={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(8);
  });

  it('marks the currently selected swatch aria-pressed, and only that one', () => {
    render(<BrandColorPicker editing value="#9a2c2c" onChange={() => {}} />);
    const maroon = screen.getByRole('button', { name: 'Maroon' });
    const slate = screen.getByRole('button', { name: 'Slate' });
    expect(maroon.getAttribute('aria-pressed')).toBe('true');
    expect(slate.getAttribute('aria-pressed')).toBe('false');
  });

  it('fires onChange with the swatch hex when clicked', () => {
    let picked: string | null = null;
    render(<BrandColorPicker editing value="#475569" onChange={(v) => { picked = v; }} />);
    screen.getByRole('button', { name: 'Teal' }).click();
    expect(picked).toBe('#0e7490');
  });

  it('view mode shows the color name for the stored value, not a hex code', () => {
    render(<BrandColorPicker editing={false} value="#475569" display="#6b3fa0" onChange={() => {}} />);
    expect(screen.getByText('Purple')).toBeTruthy();
  });

  it('view mode falls back to Slate when nothing is stored (matches the backend default)', () => {
    render(<BrandColorPicker editing={false} value="#475569" display={null} onChange={() => {}} />);
    expect(screen.getByText('Slate')).toBeTruthy();
  });
});

// UI-7 ruling 3 — owner-only fields stay visible but disabled for a
// non-owner, with an explanation; this pins the role decision the disabled
// state is built against. The visible-vs-hidden rendering itself is the
// tier-3 eyeball point.
describe('canEditBillingPolicy — the Billing Policy owner-only gate', () => {
  it('allows SCHOOL_OWNER and PLATFORM_ADMIN', () => {
    expect(canEditBillingPolicy('SCHOOL_OWNER')).toBe(true);
    expect(canEditBillingPolicy('PLATFORM_ADMIN')).toBe(true);
  });

  it('disallows PRINCIPAL — editable elsewhere on this page, but not here', () => {
    expect(canEditBillingPolicy('PRINCIPAL')).toBe(false);
  });

  it('disallows ACCOUNTANT and ACADEMIC_COORDINATOR, and undefined', () => {
    expect(canEditBillingPolicy('ACCOUNTANT')).toBe(false);
    expect(canEditBillingPolicy('ACADEMIC_COORDINATOR')).toBe(false);
    expect(canEditBillingPolicy(undefined)).toBe(false);
  });
});
