'use client';

import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';
import { authApi } from '@/lib/api/auth.api';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <SessionRestorer />
        {children}
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function SessionRestorer() {
  const { accessToken, setAccessToken, setInitialized } = useAuthStore();
  const { slug, setTenant } = useTenantStore();

  useEffect(() => {
    if (accessToken) {
      setInitialized();
      return;
    }

    // Restore tenant slug from subdomain before calling refresh.
    // The Axios interceptor reads slug from Zustand when attaching X-Tenant-Slug.
    if (!slug && typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const subdomain = hostname.split('.')[0].split(':')[0];
      if (subdomain && subdomain !== 'localhost' && subdomain !== 'www') {
        setTenant({ slug: subdomain });
      }
    }

    authApi
      .refresh()
      .then(({ data }) => setAccessToken(data.data.accessToken))
      .catch(() => {})
      .finally(() => setInitialized());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
