// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { SidebarProvider } from '@/context/sidebar-context';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';
import { useParentStore } from '@/store/parent.store';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/lib/api/auth.api', () => ({
  authApi: { logout: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/components/parent/child-switcher', () => ({
  ChildSwitcher: () => <div data-testid="child-switcher" />,
}));

import { authApi } from '@/lib/api/auth.api';
import { PortalHeader } from '../portal-header';

function setUser(role: 'STUDENT' | 'PARENT' | 'TEACHER') {
  useAuthStore.setState({
    accessToken: 'token',
    isInitialized: true,
    user: {
      id: 'u1',
      email: 'user@demo.school',
      firstName: 'Sam',
      lastName: 'Reader',
      role,
      tenantId: 't1',
      tenantSlug: 'demo',
    },
  });
}

function renderHeader() {
  return render(
    <SidebarProvider>
      <PortalHeader />
    </SidebarProvider>,
  );
}

beforeEach(() => {
  useTenantStore.setState({
    slug: 'demo',
    name: 'Demo School',
    logoUrl: null,
    primaryColor: null,
    primaryForeground: null,
  });
  useParentStore.setState({ selectedChildId: null });
  mockPush.mockReset();
  (authApi.logout as unknown as ReturnType<typeof vi.fn>).mockClear();
});

afterEach(() => {
  cleanup();
});

describe('PortalHeader — WEB-P UI/UX pass', () => {
  it('shows the ChildSwitcher for PARENT but not for STUDENT or TEACHER', () => {
    setUser('PARENT');
    renderHeader();
    expect(screen.getByTestId('child-switcher')).not.toBeNull();
    cleanup();

    setUser('STUDENT');
    renderHeader();
    expect(screen.queryByTestId('child-switcher')).toBeNull();
    cleanup();

    setUser('TEACHER');
    renderHeader();
    expect(screen.queryByTestId('child-switcher')).toBeNull();
  });

  it('shows the role label from the local ROLE_LABELS map (not a staff-only lookup) for STUDENT', () => {
    setUser('STUDENT');
    renderHeader();
    fireEvent.click(screen.getByText('Sam Reader'));
    expect(screen.getByText('Student')).not.toBeNull();
  });

  it('signs out through the full cleanup sequence when the menu sign-out button is clicked', async () => {
    setUser('TEACHER');
    renderHeader();
    fireEvent.click(screen.getByText('Sam Reader'));
    fireEvent.click(screen.getByText('Sign out'));

    await waitFor(() => {
      expect(authApi.logout).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState().accessToken).toBeNull();
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });
});
