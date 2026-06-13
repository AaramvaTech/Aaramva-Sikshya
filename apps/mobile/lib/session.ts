import { useEffect } from 'react';
import { rawApi } from './api';
import { getSecureItem, setSecureItem, deleteSecureItem } from './secureStore';
import { useAuthStore } from '../store/auth';

interface MeResponse {
  id: string;
  email: string;
  role: string;
  tenantId: string | null;
  tenantSlug: string | null;
}

/**
 * Called once from the root layout on app start.
 * Reads SecureStore and transitions the auth status from 'booting' to the
 * appropriate state: 'noSchool', 'unauthed', or 'authed'.
 */
export function useBootSession(): void {
  const { setSession, clearSession, setStatus, setSlug } = useAuthStore();

  useEffect(() => {
    void (async () => {
      try {
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

        // Both slug and refreshToken present — attempt silent session restore.
        // rawApi already has X-Client-Type: mobile as a default header.
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

        // Rotate the stored refresh token.
        await setSecureItem('refreshToken', newRefreshToken);

        // Fetch user identity — refresh response does not include user info.
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

        setSession({
          accessToken: newAccessToken,
          user: { id: user.id, email: user.email, role: user.role },
          // Tenant display name is unavailable from /auth/me; use slug as a
          // stand-in. Task 9 (navigation) does not need the display name at boot.
          tenant: { name: slug, slug, logoUrl: null },
          slug,
        });
      } catch {
        // Refresh or /me failed — clear session so the user can log in again.
        clearSession();
        await deleteSecureItem('refreshToken');
        // Keep tenantSlug so the user lands on the login screen for their school,
        // not the school-code entry screen.
        setStatus('unauthed');
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Clears the local session and fires a best-effort API logout.
 * Safe to call at any time — an expired or missing token will not trap the user.
 */
export async function logout(): Promise<void> {
  const { accessToken, slug } = useAuthStore.getState();
  const refreshToken = await getSecureItem('refreshToken');

  // Clear local session FIRST — expired token must not prevent logout.
  useAuthStore.getState().clearSession();
  await deleteSecureItem('refreshToken');
  // Keep tenantSlug so the user lands on the login screen for their school.

  if (refreshToken && accessToken && slug) {
    try {
      await rawApi.post(
        '/auth/logout',
        { refreshToken },
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
