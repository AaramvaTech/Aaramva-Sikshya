import { create } from 'zustand';
import type { TenantInfo } from '@/types/api.types';

interface TenantState {
  slug: string | null;
  name: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  primaryForeground: string | null;
  setTenant: (tenant: Partial<TenantInfo>) => void;
  clear: () => void;
}

const storedSlug = typeof window !== 'undefined' ? localStorage.getItem('tenant-slug') : null;

export const useTenantStore = create<TenantState>((set) => ({
  slug: storedSlug,
  name: null,
  logoUrl: null,
  primaryColor: null,
  primaryForeground: null,
  setTenant: (t) => {
    if (t.slug && typeof window !== 'undefined') {
      localStorage.setItem('tenant-slug', t.slug);
    }
    set({
      slug: t.slug ?? null,
      name: t.name ?? null,
      logoUrl: t.logoUrl ?? null,
      primaryColor: t.primaryColor ?? null,
      primaryForeground: t.primaryForeground ?? null,
    });
  },
  clear: () => {
    if (typeof window !== 'undefined') localStorage.removeItem('tenant-slug');
    set({ slug: null, name: null, logoUrl: null, primaryColor: null, primaryForeground: null });
  },
}));
