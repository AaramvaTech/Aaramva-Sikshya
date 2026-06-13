import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/auth';
import { getSecureItem, setSecureItem, deleteSecureItem } from './secureStore';

// 10.0.2.2 is the Android emulator's alias for the host machine's localhost.
// For a real device or iOS simulator, set EXPO_PUBLIC_API_URL to the dev machine's LAN IP.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3001/api/v1';

/** Interceptor-free instance used exclusively for token refresh to prevent infinite loops. */
export const rawApi = axios.create({ baseURL: API_BASE_URL });
rawApi.defaults.headers.common['X-Client-Type'] = 'mobile';

const api = axios.create({ baseURL: API_BASE_URL });

// ---------------------------------------------------------------------------
// Request interceptor — inject X-Client-Type, Authorization, X-Tenant-Slug
// ---------------------------------------------------------------------------
api.interceptors.request.use(async (config) => {
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

    if (error.response?.status === 401 && !originalRequest._retry) {
      // Another refresh is already in flight — queue this request until it resolves.
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await getSecureItem('refreshToken');
        // Slug may still be in Zustand if the store is warm; fall back to SecureStore.
        const slug =
          useAuthStore.getState().slug ?? (await getSecureItem('tenantSlug'));

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

        // Persist new tokens.
        useAuthStore.getState().setAccessToken(newAccessToken);
        await setSecureItem('refreshToken', newRefreshToken);

        processQueue(null, newAccessToken);
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);

        // Clear in-memory session state.
        useAuthStore.getState().clearSession();

        // Wipe only the refresh token — keep tenantSlug in SecureStore so the user
        // is routed to the login screen for their school, not the school-code entry screen.
        await deleteSecureItem('refreshToken');

        // Drive the navigation by setting status to 'unauthed'.
        // clearSession() already does this, but being explicit is safe.
        useAuthStore.getState().setStatus('unauthed');

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;
