import { create } from 'zustand';
import type { AuthUser } from '@/types/api.types';

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  isInitialized: boolean;
  setAuth: (token: string, user: AuthUser) => void;
  setAccessToken: (token: string) => void;
  setInitialized: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isInitialized: false,
  setAuth: (token, user) => set({ accessToken: token, user, isInitialized: true }),
  setAccessToken: (token) => set({ accessToken: token, isInitialized: true }),
  setInitialized: () => set({ isInitialized: true }),
  logout: () => set({ accessToken: null, user: null, isInitialized: true }),
}));
