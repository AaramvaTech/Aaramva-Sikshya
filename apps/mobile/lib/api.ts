import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { useAuthStore } from '../store/auth';
import {
  getSecureItem,
  deleteSecureItem,
  getMsSessions,
  getMsActiveSessionId,
  saveMsSessions,
} from './secureStore';
import { isAuthEndpoint } from './authEndpoints';

const API_PORT = 3001;
const API_PATH = '/api/v1';

/**
 * Resolve the dev API base URL WITHOUT hardcoding a LAN IP.
 *
 * Priority:
 *  1. EXPO_PUBLIC_API_URL — explicit override (staging/prod or unusual setups).
 *  2. Derived from how Expo served this bundle — i.e. the dev machine's CURRENT
 *     host. This tracks DHCP/Wi-Fi IP changes automatically, so it no longer
 *     breaks every day when the machine gets a new 192.168.x.x address.
 *
 * - Web runs in a browser on the dev machine → use its hostname (localhost).
 * - Native (device/emulator) → the host that served the JS bundle (`hostUri`,
 *   e.g. "192.168.1.137:8081"), which Metro already reaches, with the API port.
 */
function resolveApiBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit;

  if (Platform.OS === 'web') {
    const host =
      typeof window !== 'undefined' && window.location?.hostname
        ? window.location.hostname
        : 'localhost';
    return `http://${host}:${API_PORT}${API_PATH}`;
  }

  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:${API_PORT}${API_PATH}`;

  // Last resort: Android emulator's alias for the host machine's loopback.
  return `http://10.0.2.2:${API_PORT}${API_PATH}`;
}

export const API_BASE_URL = resolveApiBaseUrl();

/** Interceptor-free instance used exclusively for token refresh to prevent infinite loops. */
export const rawApi = axios.create({ baseURL: API_BASE_URL });
rawApi.defaults.headers.common['X-Client-Type'] = 'mobile';

const api = axios.create({ baseURL: API_BASE_URL });

/**
 * RootLayout mounts the navigator (and whatever screen the current route
 * resolves to) unconditionally — the boot spinner is only a visual overlay
 * (see app/_layout.tsx `showLoader`). On web, a page reload re-mounts
 * whatever route was in the address bar immediately, so a screen's queries
 * can fire before useBootSession() finishes restoring the session from
 * SecureStore. Wait for that restore to settle (status leaves 'booting')
 * before letting a request read auth state, so it always goes out with the
 * right headers instead of racing hydration.
 *
 * NOT applied to rawApi: useBootSession()'s own /auth/refresh call runs
 * during 'booting' — gating rawApi the same way would deadlock it.
 */
function waitForBoot(): Promise<void> {
  if (useAuthStore.getState().status !== 'booting') return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = useAuthStore.subscribe((state) => {
      if (state.status !== 'booting') {
        unsubscribe();
        resolve();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Request interceptor — inject X-Client-Type, Authorization, X-Tenant-Slug
// ---------------------------------------------------------------------------
api.interceptors.request.use(async (config) => {
  await waitForBoot();

  const { accessToken, slug } = useAuthStore.getState();
  // Fall back to SecureStore during boot when the Zustand store isn't populated yet.
  const storedSlug = slug ?? (await getSecureItem('tenantSlug'));

  config.headers['X-Client-Type'] = 'mobile';
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  if (storedSlug) config.headers['X-Tenant-Slug'] = storedSlug;

  return config;
});

// ---------------------------------------------------------------------------
// 401 response interceptor with queued-request refresh
// ---------------------------------------------------------------------------
type QueueEntry = { resolve: (token: string) => void; reject: (err: unknown) => void };
let isRefreshing = false;
let failedQueue: QueueEntry[] = [];

function processQueue(error: unknown, token: string | null): void {
  failedQueue.forEach((entry) => {
    if (error) {
      entry.reject(error);
    } else if (token) {
      entry.resolve(token);
    }
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => {
    // The backend wraps every response in { success, data, error }.
    // A success:false body with HTTP 2xx is treated as an application-level error.
    if (response.data?.success === false) {
      const code = response.data?.error?.code ?? 'ERROR';
      const msg = response.data?.error?.message ?? 'Request failed';
      return Promise.reject(new Error(`${code}: ${msg}`));
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // REG-1: a forced-change 403 must route the session to change-password, never a
    // hard error. Setting the store flag makes the root layout redirect (POL-2 T6).
    const errCode = (error.response?.data as { error?: { code?: string } } | undefined)?.error?.code;
    if (error.response?.status === 403 && errCode === 'PASSWORD_CHANGE_REQUIRED') {
      useAuthStore.getState().setMustChangePassword();
      return Promise.reject(error);
    }

    if (
      error.response?.status === 401 &&
      !isAuthEndpoint(originalRequest.url) &&
      !originalRequest._retry
    ) {
      // Another refresh is already in flight — queue this request until it resolves.
      if (isRefreshing) {
        return (new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }))
          .then((token): ReturnType<typeof api> => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const slug =
          useAuthStore.getState().slug ?? (await getSecureItem('tenantSlug'));
        const activeId = useAuthStore.getState().activeSessionId;

        // Read refresh token from the multi-session store; fall back to legacy key.
        const sessions = await getMsSessions();
        const activeMs = activeId ? sessions.find((s) => s.id === activeId) : null;
        const refreshToken =
          activeMs?.refreshToken ?? (await getSecureItem('refreshToken'));

        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        const refreshResponse = await rawApi.post<{
          success: boolean;
          data: { accessToken: string; refreshToken: string };
        }>(
          '/auth/refresh',
          { refreshToken },
          { headers: slug ? { 'X-Tenant-Slug': slug } : {} },
        );

        const newAccessToken = refreshResponse.data.data.accessToken;
        const newRefreshToken = refreshResponse.data.data.refreshToken;

        // Persist rotated refresh token.
        useAuthStore.getState().setAccessToken(newAccessToken);
        if (activeMs) {
          await saveMsSessions(
            sessions.map((s) =>
              s.id === activeId ? { ...s, refreshToken: newRefreshToken } : s,
            ),
          );
        }

        processQueue(null, newAccessToken);
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);

        // ERR-1 §1.3 rule 3: an active session expired → flag the one-shot notice,
        // then clear session state (keep slug so we route to login, not school-code entry).
        useAuthStore.getState().setSessionExpired();
        useAuthStore.getState().clearSession();

        // Remove only the active session from persisted store (keep other school sessions).
        const activeId = useAuthStore.getState().activeSessionId;
        if (activeId) {
          const sessions = await getMsSessions();
          await saveMsSessions(sessions.filter((s) => s.id !== activeId));
        } else {
          // Legacy fallback cleanup
          await deleteSecureItem('refreshToken');
        }

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;
