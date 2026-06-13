import { create } from 'zustand';

type AuthStatus = 'booting' | 'noSchool' | 'unauthed' | 'authed';

interface User {
  id: string;
  email: string;
  role: string;
}

interface Tenant {
  name: string;
  slug: string;
  logoUrl: string | null;
}

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  user: User | null;
  tenant: Tenant | null;
  slug: string | null;
}

interface AuthActions {
  setSession: (params: { accessToken: string; user: User; tenant: Tenant; slug: string }) => void;
  clearSession: () => void;
  setSlug: (slug: string) => void;
  setStatus: (status: AuthStatus) => void;
  setAccessToken: (accessToken: string) => void;
}

export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  // Initial state
  status: 'booting',
  accessToken: null,
  user: null,
  tenant: null,
  slug: null,

  // Actions
  setSession: ({ accessToken, user, tenant, slug }) =>
    set({ accessToken, user, tenant, slug, status: 'authed' }),

  clearSession: () =>
    set((state) => ({
      status: 'unauthed',
      accessToken: null,
      user: null,
      tenant: null,
      slug: state.slug, // keep slug so user stays on the same school's login screen
    })),

  setSlug: (slug) => set({ slug }),

  setStatus: (status) => set({ status }),

  setAccessToken: (accessToken) => set({ accessToken }),
}));
