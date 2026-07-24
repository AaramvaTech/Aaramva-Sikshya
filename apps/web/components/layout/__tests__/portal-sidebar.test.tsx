// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SidebarProvider } from '@/context/sidebar-context';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';
import { PortalSidebar, TEACHER_NAV_ITEMS, STUDENT_NAV_ITEMS, PARENT_NAV_ITEMS } from '../portal-sidebar';

let mockPathname = '/parent';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

function renderSidebar() {
  return render(
    <SidebarProvider>
      <PortalSidebar />
    </SidebarProvider>,
  );
}

function setUser(role: 'STUDENT' | 'PARENT' | 'TEACHER') {
  useAuthStore.setState({
    accessToken: 'token',
    isInitialized: true,
    user: {
      id: 'u1',
      email: 'user@demo.school',
      role,
      tenantId: 't1',
      tenantSlug: 'demo',
    },
  });
}

beforeEach(() => {
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

describe('PortalSidebar — role-scoped nav (WEB-P UI/UX pass)', () => {
  it('renders exactly the PARENT nav items for a PARENT user', () => {
    setUser('PARENT');
    mockPathname = '/parent';
    renderSidebar();
    for (const item of PARENT_NAV_ITEMS) {
      expect(screen.getByText(item.label)).not.toBeNull();
    }
    expect(screen.queryByText('Payroll')).toBeNull();
  });

  it('renders exactly the STUDENT nav items for a STUDENT user', () => {
    setUser('STUDENT');
    mockPathname = '/student';
    renderSidebar();
    for (const item of STUDENT_NAV_ITEMS) {
      expect(screen.getByText(item.label)).not.toBeNull();
    }
    expect(screen.queryByText('Fees')).toBeNull();
  });

  it('renders exactly the TEACHER nav items for a TEACHER user', () => {
    setUser('TEACHER');
    mockPathname = '/teacher';
    renderSidebar();
    for (const item of TEACHER_NAV_ITEMS) {
      expect(screen.getByText(item.label)).not.toBeNull();
    }
    expect(screen.queryByText('Fees')).toBeNull();
  });

  it('marks only the current route active, not every sub-route under the role home path', () => {
    setUser('PARENT');
    mockPathname = '/parent/attendance';
    renderSidebar();
    const attendanceLink = screen.getByText('Attendance').closest('a');
    const dashboardLink = screen.getByText('Dashboard').closest('a');
    expect(attendanceLink?.className).toContain('menu-item-active');
    expect(dashboardLink?.className).toContain('menu-item-inactive');
  });

  it('links the logo to the role home route', () => {
    setUser('TEACHER');
    mockPathname = '/teacher/marks';
    renderSidebar();
    const logoLink = screen.getByText('Demo School').closest('a');
    expect(logoLink?.getAttribute('href')).toBe('/teacher');
  });
});
