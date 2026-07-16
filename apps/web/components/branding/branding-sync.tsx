'use client';

/**
 * BRAND-1 — drives the theming engine from the active tenant, mirroring
 * apps/mobile/components/ThemeSync.tsx.
 *
 * Two feeds:
 *   - authed panel  -> the tenant store, filled by /auth/me (not throttled)
 *   - (auth) pages  -> GET /tenants/verify/:slug (public; 10/min per IP, which
 *                      is why the panel does NOT use it)
 *
 * Renders nothing.
 */
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';
import { rawApi } from '@/lib/api';
import { deriveBrandScale } from '@/lib/branding/scale';
import { applyBrandScale, resetBrandScale, type ThemeMode } from '@/lib/branding/apply';
import { writeBrandingCache, BRANDING_CACHE_VERSION } from '@/lib/branding/cache';

interface VerifyData {
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  primaryForeground: string | null;
}

function paint(slug: string, color: string | null, fg: string | null, theme: ThemeMode): void {
  const scale = deriveBrandScale(color);
  if (!scale) {
    // No colour, or one we cannot parse -> Aaramva.
    resetBrandScale();
    return;
  }
  applyBrandScale(scale, fg, theme);
  writeBrandingCache(slug, { v: BRANDING_CACHE_VERSION, source: color!, fg, scale });
}

export function BrandingSync() {
  const pathname = usePathname();
  const accessToken = useAuthStore((s) => s.accessToken);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const slug = useTenantStore((s) => s.slug);
  const primaryColor = useTenantStore((s) => s.primaryColor);
  const primaryForeground = useTenantStore((s) => s.primaryForeground);
  // `forcedTheme` MUST win over `resolvedTheme`, and this is not defensive
  // padding: next-themes computes `resolvedTheme` from the STORED preference and
  // ignores forcedTheme entirely (`resolvedTheme: c==="system"?T:c`), while it
  // APPLIES `forcedTheme ?? theme` to <html>. Since dark mode was removed via
  // forcedTheme="light" (app/providers.tsx), anyone still carrying theme:"dark"
  // in localStorage from before would report resolvedTheme==='dark' on a page
  // that is definitively light — and we would paint the dark `--primary` (a
  // LIGHT fill, step 400) onto a white UI.
  // Also: resolvedTheme is undefined until mounted, so default to light rather
  // than guessing dark.
  const { resolvedTheme, forcedTheme } = useTheme();
  const theme: ThemeMode = (forcedTheme ?? resolvedTheme) === 'dark' ? 'dark' : 'light';

  // The platform console spans every school, so no single school's colour
  // applies. Keep it Aaramva.
  const isPlatform = pathname?.startsWith('/super-admin') ?? false;

  useEffect(() => {
    if (isPlatform || !slug) {
      resetBrandScale();
      return;
    }
    // Auth state is still unknown (cold-load boot window, before
    // SessionRestorer's /auth/refresh -> /auth/me round-trip settles):
    // accessToken reads null here regardless of whether the user is
    // actually authed, so we can't yet tell "logged out, use verify" apart
    // from "authed, verify is off-limits" (10/min per IP — a school office
    // behind one NAT would 429 on ordinary loads). Do nothing and leave the
    // pre-paint script's cached branding on screen until isInitialized
    // flips true; every SessionRestorer path terminates by setting it.
    if (!isInitialized) {
      return;
    }
    if (primaryColor) {
      paint(slug, primaryColor, primaryForeground, theme);
      return;
    }
    // Authed panel, tenant has no custom colour (e.g. `demo`) -> Aaramva
    // locally. A live access token means /auth/me already answered the
    // colour question (null == "no branding"), so don't also ask the
    // throttled verify endpoint — that's the whole reason this component
    // doesn't call it on the authed panel (see module docblock).
    if (accessToken) {
      resetBrandScale();
      return;
    }

    // Logged out on an (auth) page: the store has a slug but no colour yet.
    let cancelled = false;
    rawApi
      .get<{ success: boolean; data: VerifyData }>(`/tenants/verify/${slug}`)
      .then((res) => {
        if (cancelled) return;
        const d = res.data.data;
        paint(slug, d.primaryColor, d.primaryForeground, theme);
      })
      .catch(() => {
        // 429 (throttled), 404 (unknown school), offline — keep whatever the
        // pre-paint script applied. Never block the login form.
      });
    return () => {
      cancelled = true;
    };
  }, [isPlatform, slug, primaryColor, primaryForeground, accessToken, isInitialized, theme]);

  return null;
}
