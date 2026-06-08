'use client';

import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';
import { authApi } from '@/lib/api/auth.api';
import { SidebarProvider } from '@/context/sidebar-context';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
      <SidebarProvider>
        <QueryClientProvider client={queryClient}>
          <SessionRestorer />
          {children}
          <Toaster />
        </QueryClientProvider>
      </SidebarProvider>
    </ThemeProvider>
  );
}

function SessionRestorer() {
  const { accessToken, setAuth, setAccessToken, setInitialized } = useAuthStore();
  const { slug, setTenant } = useTenantStore();

  useEffect(() => {
    if (accessToken) {
      setInitialized();
      return;
    }

    // Restore tenant slug: subdomain (prod) → ?tenant= param (local dev) → localStorage fallback.
    // The Axios interceptor reads slug from Zustand when attaching X-Tenant-Slug.
    if (!slug && typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const subdomain = hostname.split('.')[0].split(':')[0];
      const devSlug = new URLSearchParams(window.location.search).get('tenant');
      const lsSlug = localStorage.getItem('tenant-slug');
      const resolved =
        (subdomain !== 'localhost' && subdomain !== 'www') ? subdomain : devSlug ?? lsSlug;
      if (resolved) setTenant({ slug: resolved });
    }

    authApi
      .refresh()
      .then(async ({ data }) => {
        const token = data.data.accessToken;
        setAccessToken(token);
        // Fetch full user profile (firstName, lastName, etc.) — not in token payload
        try {
          const meRes = await authApi.me();
          const meUser = meRes.data.data;
          setAuth(token, meUser);
          // Restore tenant context from profile (survives refresh even without localStorage)
          if (meUser.tenant) {
            setTenant(meUser.tenant);
          } else if (meUser.tenantSlug) {
            setTenant({ slug: meUser.tenantSlug });
          }
        } catch {
          // Non-critical — app works with just the token
        }
      })
      .catch(() => {})
      .finally(() => setInitialized());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
