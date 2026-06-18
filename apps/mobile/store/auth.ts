import { create } from 'zustand';

type AuthStatus = 'booting' | 'noSchool' | 'unauthed' | 'authed';

export interface SchoolSession {
  id: string;          // `${schoolSlug}:${userId}`
  schoolSlug: string;
  schoolName: string;
  userId: string;
  userEmail: string;
  role: string;
  accessToken: string | null;  // in-memory only, never persisted
}

interface AuthState {
  status: AuthStatus;
  sessions: SchoolSession[];
  activeSessionId: string | null;
  selectedChildId: string | null;
  // Derived from active session — kept as top-level for backward compat:
  accessToken: string | null;
  slug: string | null;
  user: { id: string; email: string; role: string } | null;
  tenant: { name: string; slug: string; logoUrl: string | null } | null;
}

function deriveFromSession(
  session: SchoolSession | null,
): Pick<AuthState, 'accessToken' | 'slug' | 'user' | 'tenant'> {
  if (!session) return { accessToken: null, slug: null, user: null, tenant: null };
  return {
    accessToken: session.accessToken,
    slug: session.schoolSlug,
    user: { id: session.userId, email: session.userEmail, role: session.role },
    tenant: { name: session.schoolName, slug: session.schoolSlug, logoUrl: null },
  };
}

interface AuthActions {
  setStatus: (status: AuthStatus) => void;
  setSlug: (slug: string) => void;
  clearSlug: () => void;
  // Add or replace a session (used by login + session restore)
  upsertSession: (session: SchoolSession) => void;
  // Make a session active and update derived fields
  setActiveSession: (sessionId: string) => void;
  // Update access token for the active session (called by api.ts on refresh)
  setAccessToken: (accessToken: string) => void;
  // Remove a session; if it was active, pick the next or go unauthed
  removeSession: (sessionId: string) => void;
  // Parent: remember which child is selected for the active school
  setSelectedChildId: (id: string | null) => void;
  // ─── Legacy compat (used by session.ts and login.tsx) ───────────────────────
  setSession: (params: {
    accessToken: string;
    user: { id: string; email: string; role: string };
    tenant: { name: string; slug: string; logoUrl: string | null };
    slug: string;
  }) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  status: 'booting',
  sessions: [],
  activeSessionId: null,
  selectedChildId: null,
  accessToken: null,
  slug: null,
  user: null,
  tenant: null,

  // ── Actions ────────────────────────────────────────────────────────────────
  setStatus: (status) => set({ status }),

  setSlug: (slug) => set({ slug }),

  clearSlug: () => set({ slug: null }),

  upsertSession: (session) =>
    set((state) => {
      const exists = state.sessions.some((s) => s.id === session.id);
      const sessions = exists
        ? state.sessions.map((s) => (s.id === session.id ? session : s))
        : [...state.sessions, session];
      return { sessions };
    }),

  setActiveSession: (sessionId) =>
    set((state) => {
      const session = state.sessions.find((s) => s.id === sessionId) ?? null;
      return {
        activeSessionId: sessionId,
        status: 'authed',
        selectedChildId: null, // reset child selection when switching school
        ...deriveFromSession(session),
      };
    }),

  setAccessToken: (accessToken) =>
    set((state) => {
      const sessions = state.sessions.map((s) =>
        s.id === state.activeSessionId ? { ...s, accessToken } : s,
      );
      return { sessions, accessToken };
    }),

  removeSession: (sessionId) =>
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== sessionId);
      if (state.activeSessionId !== sessionId) return { sessions };

      const next = sessions[0] ?? null;
      if (next) {
        return {
          sessions,
          activeSessionId: next.id,
          status: 'authed',
          selectedChildId: null,
          ...deriveFromSession(next),
        };
      }
      // No sessions left — go unauthed but keep slug for school login redirect
      return {
        sessions,
        activeSessionId: null,
        status: 'unauthed',
        selectedChildId: null,
        accessToken: null,
        user: null,
        tenant: null,
        slug: state.slug,
      };
    }),

  setSelectedChildId: (id) => set({ selectedChildId: id }),

  // ── Legacy compat wrappers ──────────────────────────────────────────────────
  setSession: ({ accessToken, user, tenant, slug }) => {
    const id = `${slug}:${user.id}`;
    const session: SchoolSession = {
      id,
      schoolSlug: slug,
      schoolName: tenant.name,
      userId: user.id,
      userEmail: user.email,
      role: user.role,
      accessToken,
    };
    set((state) => {
      const exists = state.sessions.some((s) => s.id === id);
      const sessions = exists
        ? state.sessions.map((s) => (s.id === id ? session : s))
        : [...state.sessions, session];
      const switching = state.activeSessionId !== id;
      return {
        sessions,
        activeSessionId: id,
        status: 'authed',
        selectedChildId: switching ? null : state.selectedChildId,
        ...deriveFromSession(session),
      };
    });
  },

  clearSession: () =>
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== state.activeSessionId);
      const next = sessions[0] ?? null;
      if (next) {
        return {
          sessions,
          activeSessionId: next.id,
          status: 'authed',
          selectedChildId: null,
          ...deriveFromSession(next),
        };
      }
      return {
        sessions,
        activeSessionId: null,
        status: 'unauthed',
        selectedChildId: null,
        accessToken: null,
        user: null,
        tenant: null,
        slug: state.slug,
      };
    }),
}));

// Convenience selector — avoids recreating the getter on every render
export function getActiveSession(state: AuthState): SchoolSession | null {
  return state.sessions.find((s) => s.id === state.activeSessionId) ?? null;
}
