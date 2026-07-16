'use client';

import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';
import { BrandingSync } from '@/components/branding/branding-sync';
import { rawApi } from '@/lib/api';
import { authApi } from '@/lib/api/auth.api';
import { superAdminApi } from '@/lib/api/super-admin.api';
import { clearAuthMarker } from '@/lib/auth-marker';
import { SidebarProvider } from '@/context/sidebar-context';
import { toast } from 'sonner';
import { getErrorDisplay } from '@/lib/errors';

// ERR-1 §1.4 — map an error to a safe toast. Validation is left to forms
// (inline field errors); session-expiry is already handled by the axios
// interceptor (logout + one notice) — don't double-notify either here.
function notifyQueryError(error: unknown): void {
  const display = getErrorDisplay(error);
  if (display.kind === 'validation' || display.kind === 'session-expired') return;
  toast.error(display.message);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
        // §1.4: UNHANDLED query errors get a mapped toast by default (opt out per
        // query via meta.suppressGlobalError). Queries render inline error states
        // (QueryErrorState) but don't toast, so there is no double-notify.
        queryCache: new QueryCache({
          onError: (error, query) => {
            if (query.meta?.suppressGlobalError) return;
            notifyQueryError(error);
          },
        }),
        // Mutations are NOT blanket-toasted: every mutation in this app is awaited
        // inside a try/catch (mutateAsync, ~100 sites) whose catch already renders
        // the error, so a MutationCache-level toast would fire a SECOND time for
        // each. Mutations therefore stay explicitly handled by their local
        // handlers (routed through getErrorDisplay / extractApiErrors). This hook
        // is opt-IN for the rare mutation with no local catch (meta.globalError).
        mutationCache: new MutationCache({
          onError: (error, _vars, _ctx, mutation) => {
            if (mutation.meta?.globalError !== true) return;
            notifyQueryError(error);
          },
        }),
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
      <SidebarProvider>
        <QueryClientProvider client={queryClient}>
          <SessionRestorer />
          <BrandingSync />
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

    // Platform admins hold a DIFFERENT session: public schema, no tenant, its own
    // httpOnly cookie. Restore it from the platform refresh so a reload no longer
    // drops the super-admin session (the access token is memory-only). A failure
    // clears the marker, so a dead session can't bounce the user around.
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/super-admin')) {
      superAdminApi
        .refresh()
        .then((res) => {
          const { accessToken: token, admin } = res.data.data;
          setAuth(token, {
            id: admin.id,
            email: admin.email,
            firstName: admin.firstName,
            lastName: admin.lastName,
            role: 'PLATFORM_ADMIN',
            tenantId: null,
            tenantSlug: null,
          });
        })
        .catch(() => clearAuthMarker())
        .finally(() => setInitialized());
      return;
    }

    // Consume impersonation token passed from the super-admin tab via localStorage.
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('impersonation_handoff');
      if (raw) {
        try {
          const handoff = JSON.parse(raw) as {
            accessToken: string;
            tenantSlug: string;
            schoolName: string;
            expires: number;
          };
          localStorage.removeItem('impersonation_handoff');
          if (Date.now() < handoff.expires) {
            setTenant({ slug: handoff.tenantSlug, name: handoff.schoolName });
            setAuth(handoff.accessToken, {
              id: '',
              email: '',
              role: 'SCHOOL_OWNER',
              tenantId: null,
              tenantSlug: handoff.tenantSlug,
            });
            setInitialized();
            return;
          }
        } catch {
          localStorage.removeItem('impersonation_handoff');
        }
      }
    }

    // Restore tenant slug: subdomain (prod) → ?tenant= param (local dev) → localStorage fallback.
    let effectiveSlug = slug;
    if (!effectiveSlug && typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const subdomain = hostname.split('.')[0].split(':')[0];
      const devSlug = new URLSearchParams(window.location.search).get('tenant');
      const lsSlug = localStorage.getItem('tenant-slug');
      const resolved =
        (subdomain !== 'localhost' && subdomain !== 'www') ? subdomain : devSlug ?? lsSlug;
      if (resolved) {
        setTenant({ slug: resolved });
        effectiveSlug = resolved;
      }
    }

    rawApi
      .post('/auth/refresh', {}, {
        headers: effectiveSlug ? { 'X-Tenant-Slug': effectiveSlug } : {},
      })
      .then(async (res) => {
        const token: string = res.data?.data?.accessToken;
        if (!token) return;
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
      .catch(() => {
        // Failed refresh → no live session. Clear the marker so middleware stops
        // treating this browser as authed and bouncing it away from /login.
        clearAuthMarker();
      })
      .finally(() => setInitialized());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
