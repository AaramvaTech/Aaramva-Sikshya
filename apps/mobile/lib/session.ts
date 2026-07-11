import { useEffect } from 'react';
import { rawApi } from './api';
import {
  getSecureItem,
  deleteSecureItem,
  getMsSessions,
  getMsActiveSessionId,
  saveMsSessions,
  saveMsActiveSessionId,
  deleteMsActiveSessionId,
  upsertPersistedSession,
  type PersistedSession,
} from './secureStore';
import { useAuthStore } from '../store/auth';
import { getPushTokenSafe } from './notifications';

interface MeResponse {
  id: string;
  email: string;
  role: string;
  tenantId: string | null;
  tenantSlug: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function restoreSession(
  persisted: PersistedSession,
  setSession: ReturnType<typeof useAuthStore.getState>['setSession'],
  setStatus: ReturnType<typeof useAuthStore.getState>['setStatus'],
): Promise<boolean> {
  try {
    const refreshRes = await rawApi.post<{
      success: boolean;
      data: { accessToken: string; refreshToken: string };
    }>(
      '/auth/refresh',
      { refreshToken: persisted.refreshToken },
      { headers: { 'X-Tenant-Slug': persisted.schoolSlug } },
    );
    const newAccessToken = refreshRes.data.data.accessToken;
    const newRefreshToken = refreshRes.data.data.refreshToken;

    // Rotate stored refresh token
    const sessions = await getMsSessions();
    await saveMsSessions(
      sessions.map((s) =>
        s.id === persisted.id ? { ...s, refreshToken: newRefreshToken } : s,
      ),
    );

    // Fetch user identity if role is missing (migration path)
    let role = persisted.role;
    let userEmail = persisted.userEmail;
    if (!role) {
      const meRes = await rawApi.get<{ success: boolean; data: MeResponse }>(
        '/auth/me',
        {
          headers: {
            Authorization: `Bearer ${newAccessToken}`,
            'X-Tenant-Slug': persisted.schoolSlug,
          },
        },
      );
      role = meRes.data.data.role;
      userEmail = meRes.data.data.email;
    }

    setSession({
      accessToken: newAccessToken,
      user: { id: persisted.userId, email: userEmail, role },
      tenant: { name: persisted.schoolName, slug: persisted.schoolSlug, logoUrl: null },
      slug: persisted.schoolSlug,
    });
    return true;
  } catch {
    return false;
  }
}

// ─── Boot hook ────────────────────────────────────────────────────────────────

/**
 * Called once from the root layout on app start.
 * Reads persisted sessions and restores the active one, or falls back to the
 * legacy single-session format (migration path).
 */
export function useBootSession(): void {
  const { setSession, clearSession, setStatus, setSlug, upsertSession, setActiveSession } =
    useAuthStore();

  useEffect(() => {
    void (async () => {
      try {
        // ── New multi-session format ───────────────────────────────────────────
        const msSessions = await getMsSessions();
        const msActiveId = await getMsActiveSessionId();

        if (msSessions.length > 0) {
          const activeSession =
            (msActiveId ? msSessions.find((s) => s.id === msActiveId) : null) ??
            msSessions[0];

          // Load all sessions into the store (for school switcher)
          for (const s of msSessions) {
            upsertSession({
              id: s.id,
              schoolSlug: s.schoolSlug,
              schoolName: s.schoolName,
              userId: s.userId,
              userEmail: s.userEmail,
              role: s.role,
              accessToken: null,
            });
          }

          const ok = await restoreSession(activeSession, setSession, setStatus);
          if (!ok) {
            // Remove the failing session; keep others if any
            const remaining = msSessions.filter((s) => s.id !== activeSession.id);
            await saveMsSessions(remaining);
            if (remaining.length > 0) {
              await saveMsActiveSessionId(remaining[0].id);
              const ok2 = await restoreSession(remaining[0], setSession, setStatus);
              if (ok2) return;
            } else {
              await deleteMsActiveSessionId();
            }
            setSlug(activeSession.schoolSlug);
            setStatus('unauthed');
          }
          return;
        }

        // ── Legacy single-session format (migration) ───────────────────────────
        const slug = await getSecureItem('tenantSlug');
        const refreshToken = await getSecureItem('refreshToken');

        if (!slug) {
          setStatus('noSchool');
          return;
        }

        if (!refreshToken) {
          setSlug(slug);
          setStatus('unauthed');
          return;
        }

        // Attempt refresh with old-format token
        const refreshRes = await rawApi.post<{
          success: boolean;
          data: { accessToken: string; refreshToken: string };
        }>(
          '/auth/refresh',
          { refreshToken },
          { headers: { 'X-Tenant-Slug': slug } },
        );
        const newAccessToken = refreshRes.data.data.accessToken;
        const newRefreshToken = refreshRes.data.data.refreshToken;

        const meRes = await rawApi.get<{ success: boolean; data: MeResponse }>(
          '/auth/me',
          {
            headers: {
              Authorization: `Bearer ${newAccessToken}`,
              'X-Tenant-Slug': slug,
            },
          },
        );
        const user = meRes.data.data;

        // Migrate to new format
        const migratedId = `${slug}:${user.id}`;
        const migrated: PersistedSession = {
          id: migratedId,
          schoolSlug: slug,
          schoolName: slug,
          userId: user.id,
          userEmail: user.email,
          role: user.role,
          refreshToken: newRefreshToken,
        };
        await upsertPersistedSession(migrated);
        await saveMsActiveSessionId(migratedId);
        // Remove old keys
        await deleteSecureItem('refreshToken');
        await deleteSecureItem('tenantSlug');

        setSession({
          accessToken: newAccessToken,
          user: { id: user.id, email: user.email, role: user.role },
          tenant: { name: slug, slug, logoUrl: null },
          slug,
        });
      } catch {
        clearSession();
        // Don't wipe SecureStore here — let the user try to log in again.
        const slug = await getSecureItem('tenantSlug').catch(() => null);
        if (slug) setSlug(slug);
        setStatus('unauthed');
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

// ─── Persist after login ──────────────────────────────────────────────────────

/**
 * Saves a freshly-logged-in session to SecureStore.
 * Called from login.tsx instead of the old setSecureItem('refreshToken', ...).
 */
export async function persistLoginSession(data: {
  userId: string;
  userEmail: string;
  role: string;
  schoolSlug: string;
  schoolName: string;
  refreshToken: string;
}): Promise<void> {
  const id = `${data.schoolSlug}:${data.userId}`;
  await upsertPersistedSession({ id, ...data });
  await saveMsActiveSessionId(id);
  // Clean up legacy keys if they exist
  await deleteSecureItem('refreshToken').catch(() => {});
  await deleteSecureItem('tenantSlug').catch(() => {});
}

// ─── Logout ───────────────────────────────────────────────────────────────────

/**
 * Logs the user out of the active school session.
 * If other sessions exist they are kept; the store switches to the next one.
 * If this was the only session the app goes to 'unauthed'.
 */
export async function logout(): Promise<void> {
  const state = useAuthStore.getState();
  const activeId = state.activeSessionId;
  const accessToken = state.accessToken;
  const slug = state.slug;

  // Get the refresh token for the best-effort API call
  const sessions = await getMsSessions();
  const activeMs = sessions.find((s) => s.id === activeId);
  const refreshToken = activeMs?.refreshToken ?? null;

  // Remove from persisted store FIRST
  if (activeId) {
    await removeSessionFromStore(activeId, sessions);
  }

  // Update Zustand
  useAuthStore.getState().removeSession(activeId ?? '');

  // Best-effort server-side logout (fire and forget). Includes this device's
  // push token (when resolvable without prompting) so the API drops the
  // device_tokens row for THIS tenant — R3: no stale tokens after logout.
  if (refreshToken && accessToken && slug) {
    try {
      const expoPushToken = await getPushTokenSafe();
      await rawApi.post(
        '/auth/logout',
        { refreshToken, ...(expoPushToken ? { expoPushToken } : {}) },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Tenant-Slug': slug,
          },
        },
      );
    } catch {
      // Swallow — session is already cleared locally.
    }
  }
}

async function removeSessionFromStore(
  sessionId: string,
  current: PersistedSession[],
): Promise<void> {
  const remaining = current.filter((s) => s.id !== sessionId);
  await saveMsSessions(remaining);
  if (remaining.length > 0) {
    await saveMsActiveSessionId(remaining[0].id);
  } else {
    await deleteMsActiveSessionId();
  }
}
