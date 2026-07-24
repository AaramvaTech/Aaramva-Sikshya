// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SidebarProvider, useSidebar } from '@/context/sidebar-context';
import { SidebarBackdrop } from '../sidebar-backdrop';

// Shared by SchoolShell and PortalShell — both mobile drawers need a
// click-outside-to-close overlay. Previously an unexported inline function
// inside school-shell.tsx; extracted here so PortalShell can reuse it
// without duplicating the click-to-close logic (WEB-P UI/UX pass,
// docs/superpowers/specs/2026-07-24-portal-shell-sidebar-design.md).

function Harness() {
  const { toggleMobileSidebar } = useSidebar();
  return (
    <>
      <button onClick={toggleMobileSidebar}>toggle</button>
      <SidebarBackdrop />
    </>
  );
}

afterEach(() => {
  cleanup();
});

describe('SidebarBackdrop', () => {
  it('renders nothing when the mobile sidebar is closed', () => {
    render(
      <SidebarProvider>
        <Harness />
      </SidebarProvider>,
    );
    expect(document.querySelector('.fixed.inset-0.z-40')).toBeNull();
  });

  it('renders the overlay once the mobile sidebar opens, and closes it on click', () => {
    render(
      <SidebarProvider>
        <Harness />
      </SidebarProvider>,
    );
    fireEvent.click(screen.getByText('toggle'));
    const overlay = document.querySelector('.fixed.inset-0.z-40');
    expect(overlay).not.toBeNull();

    fireEvent.click(overlay as Element);
    expect(document.querySelector('.fixed.inset-0.z-40')).toBeNull();
  });
});
