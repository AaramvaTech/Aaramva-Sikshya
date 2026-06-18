import { useEffect } from 'react';
import { useAuthStore } from '../store/auth';
import { useBranding } from '../lib/theme/provider';
import { rawApi } from '../lib/api';
import { getBrandingCache, setBrandingCache } from '../lib/secureStore';

type Branding = { name?: string; primaryColor?: string; primaryForeground?: string; logoUrl?: string };

interface VerifyData {
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string | null;
  primaryForeground: string | null;
}

function toBranding(d: VerifyData): Branding {
  return {
    name: d.name,
    logoUrl: d.logoUrl ?? undefined,
    primaryColor: d.primaryColor ?? undefined,       // null -> undefined -> Aaramva default
    primaryForeground: d.primaryForeground ?? undefined,
  };
}

/**
 * Drives the theming engine from the active school slug:
 * applies cached branding instantly on mount/slug-change, then refreshes from
 * the public /tenants/verify endpoint. Resets to Aaramva when no slug.
 * Renders nothing.
 */
export default function ThemeSync() {
  const slug = useAuthStore((s) => s.slug);
  const { applySchool, reset } = useBranding();

  useEffect(() => {
    if (!slug) {
      reset();
      return;
    }
    let cancelled = false;

    void (async () => {
      // 1) apply cached branding immediately (no flash on cold start)
      try {
        const cached = await getBrandingCache(slug);
        if (cached && !cancelled) applySchool(JSON.parse(cached) as Branding);
      } catch {
        // ignore cache errors
      }

      // 2) refresh from the public verify endpoint
      try {
        const res = await rawApi.get<{ success: boolean; data: VerifyData }>(
          `/tenants/verify/${slug}`,
        );
        if (cancelled) return;
        const branding = toBranding(res.data.data);
        applySchool(branding);
        await setBrandingCache(slug, JSON.stringify(branding));
      } catch {
        // keep cached/default branding on failure
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, applySchool, reset]);

  return null;
}
