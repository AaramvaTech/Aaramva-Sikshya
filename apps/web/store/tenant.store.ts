import { create } from 'zustand';
import type { TenantInfo } from '@/types/api.types';

interface TenantState {
  slug: string | null;
  name: string | null;
  logoUrl: string | null;
  setTenant: (tenant: Partial<TenantInfo>) => void;
  clear: () => void;
}

export const useTenantStore = create<TenantState>((set) => ({
  slug: null,
  name: null,
  logoUrl: null,
  setTenant: (t) => set({ slug: t.slug ?? null, name: t.name ?? null, logoUrl: t.logoUrl ?? null }),
  clear: () => set({ slug: null, name: null, logoUrl: null }),
}));
