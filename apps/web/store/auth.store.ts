import { create } from 'zustand';
import type { AuthUser } from '@/types/api.types';
import { setAuthMarker, clearAuthMarker } from '@/lib/auth-marker';

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  isInitialized: boolean;
  setAuth: (token: string, user: AuthUser) => void;
  setAccessToken: (token: string) => void;
  setInitialized: () => void;
  logout: () => void;
}

// The `_auth` marker mirrors auth state so Next middleware can make an edge
// redirect decision. Setting/clearing it in these actions covers every call site
// (login, /me, impersonation handoff, refresh success, and all logout paths).
// It is a spoofable UX hint only — see lib/auth-marker.ts.
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isInitialized: false,
  setAuth: (token, user) => {
    setAuthMarker();
    set({ accessToken: token, user, isInitialized: true });
  },
  setAccessToken: (token) => {
    setAuthMarker();
    set({ accessToken: token, isInitialized: true });
  },
  setInitialized: () => set({ isInitialized: true }),
  logout: () => {
    clearAuthMarker();
    set({ accessToken: null, user: null, isInitialized: true });
  },
}));
