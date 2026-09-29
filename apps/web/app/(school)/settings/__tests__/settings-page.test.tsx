// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { filesApi } from '@/lib/api/files.api';
import { BrandColorPicker, ImageField, canEditBillingPolicy } from '../page';

vi.mock('@/lib/api/files.api', () => ({ filesApi: { presignRead: vi.fn() } }));

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

// ImageField must never render <img src=""> (React warns; a failed presign
// showed a broken image). Real useFileUrl, mocked presign endpoint.
describe('ImageField', () => {
  const KEY = 'tenant_demo/school-stamp/0b6b4343-1111-4222-8333-444455556666.png';
  const renderField = (value: string) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <ImageField label="Stamp" value={value} onChange={() => {}} editing={false} boxClass="h-20 w-20" fallback={<span>fallback</span>} />
      </QueryClientProvider>,
    );
  };

  it('stored key, link unresolved → placeholder, no <img>', () => {
    vi.mocked(filesApi.presignRead).mockReturnValue(new Promise(() => {}));
    renderField(KEY);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('fallback')).toBeTruthy();
  });

  it('presign fails → placeholder, no <img>', async () => {
    vi.mocked(filesApi.presignRead).mockRejectedValue(new Error('503'));
    renderField(KEY);
    await waitFor(() => expect(filesApi.presignRead).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('fallback')).toBeTruthy();
  });

  it('link resolved → <img> with that src', async () => {
    vi.mocked(filesApi.presignRead).mockResolvedValue({ url: 'https://s3.test/x?sig=1' } as never);
    renderField(KEY);
    const img = await screen.findByRole('img');
    expect(img.getAttribute('src')).toBe('https://s3.test/x?sig=1');
  });

  it('resolved link that fails to load → placeholder, not a broken image', async () => {
    vi.mocked(filesApi.presignRead).mockResolvedValue({ url: 'https://s3.test/x?sig=1' } as never);
    renderField(KEY);
    fireEvent.error(await screen.findByRole('img'));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('fallback')).toBeTruthy();
  });

  it('data: preview (picked file before save) still shows', () => {
    renderField('data:image/png;base64,AAAA');
    expect(screen.getByRole('img').getAttribute('src')).toBe('data:image/png;base64,AAAA');
  });
});
