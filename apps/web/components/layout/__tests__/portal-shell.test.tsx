// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SidebarProvider } from '@/context/sidebar-context';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';
import { PortalShell } from '../portal-shell';

const mockReplace = vi.fn();
let mockPathname = '/student';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  usePathname: () => mockPathname,
}));

function renderShell(pathname: string) {
  mockPathname = pathname;
  return render(
    <SidebarProvider>
      <PortalShell>
        <div>Page Content</div>
      </PortalShell>
    </SidebarProvider>,
  );
}

beforeEach(() => {
  mockReplace.mockReset();
  useAuthStore.setState({
    accessToken: 'token-123',
    isInitialized: true,
    user: {
      id: 'u1',
      email: 'student@demo.school',
      firstName: 'Sam',
      lastName: 'Reader',
      role: 'STUDENT',
      tenantId: 't1',
      tenantSlug: 'demo',
      mustChangePassword: false,
    },
  });
  useTenantStore.setState({
    slug: 'demo',
    name: 'Demo School',
    logoUrl: null,
    primaryColor: null,
    primaryForeground: null,
  });
});

afterEach(() => {
  cleanup();
});

describe('PortalShell — sidebar/header restructure preserves access gating (WEB-P UI/UX pass)', () => {
  it('renders a real <aside> sidebar (not the old inline header nav) alongside page content when the role can access the path', () => {
    renderShell('/student');
    expect(screen.getByText('Page Content')).not.toBeNull();
    // The concrete, new-vs-old signal for this task: the old PortalShell had
    // no <aside> at all (a single <header> with inline nav links). Only the
    // new PortalSidebar introduces one.
    expect(document.querySelector('aside')).not.toBeNull();
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
  });

  it('renders AccessDenied instead of children when the role cannot access the path (pre-existing behavior, must survive the restructure)', () => {
    useAuthStore.setState((s) => ({
      user: s.user ? { ...s.user, role: 'TEACHER' } : s.user,
    }));
    renderShell('/student');
    expect(screen.queryByText('Page Content')).toBeNull();
    expect(screen.getByText(/don.t have access to this section/i)).not.toBeNull();
  });
});
