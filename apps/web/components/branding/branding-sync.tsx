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
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';
import { rawApi } from '@/lib/api';
import { deriveBrandScale } from '@/lib/branding/scale';
import { applyBrandScale, resetBrandScale } from '@/lib/branding/apply';
import { writeBrandingCache, BRANDING_CACHE_VERSION } from '@/lib/branding/cache';

interface VerifyData {
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  primaryForeground: string | null;
}

function paint(slug: string, color: string | null, fg: string | null): void {
  const scale = deriveBrandScale(color);
  if (!scale) {
    // No colour, or one we cannot parse -> Aaramva.
    resetBrandScale();
    return;
  }
  applyBrandScale(scale, fg);
  writeBrandingCache(slug, { v: BRANDING_CACHE_VERSION, source: color!, fg, scale });
}

export function BrandingSync() {
  const pathname = usePathname();
  const accessToken = useAuthStore((s) => s.accessToken);
  const slug = useTenantStore((s) => s.slug);
  const primaryColor = useTenantStore((s) => s.primaryColor);
  const primaryForeground = useTenantStore((s) => s.primaryForeground);

  // The platform console spans every school, so no single school's colour
  // applies. Keep it Aaramva.
  const isPlatform = pathname?.startsWith('/super-admin') ?? false;

  useEffect(() => {
    if (isPlatform || !slug) {
      resetBrandScale();
      return;
    }
    if (primaryColor) {
      paint(slug, primaryColor, primaryForeground);
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
        paint(slug, d.primaryColor, d.primaryForeground);
      })
      .catch(() => {
        // 429 (throttled), 404 (unknown school), offline — keep whatever the
        // pre-paint script applied. Never block the login form.
      });
    return () => {
      cancelled = true;
    };
  }, [isPlatform, slug, primaryColor, primaryForeground, accessToken]);

  return null;
}
