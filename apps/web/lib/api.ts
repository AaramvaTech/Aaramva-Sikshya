import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

/** sessionStorage key that carries the AUTH_SESSION_EXPIRED notice across the
 *  hard redirect to /login (the interceptor runs outside React). */
export const SESSION_EXPIRED_KEY = 'auth:sessionExpired';

// ERR-1 §1.3 rule 1 — the refresh flow must NEVER run for these endpoints. A 401
// from them surfaces the server envelope directly to the caller (e.g. a wrong
// login shows "Invalid email or password.", not a redirect/refresh side effect).
const AUTH_ENDPOINTS = ['/auth/login', '/auth/refresh', '/auth/forgot-password', '/auth/reset-password'];
function isAuthEndpoint(url?: string): boolean {
  return !!url && AUTH_ENDPOINTS.some((p) => url === p || url.startsWith(p));
}

function currentSlug(): string | null {
  return (
    useTenantStore.getState().slug ??
    (typeof window !== 'undefined' ? localStorage.getItem('tenant-slug') : null)
  );
}

const api = axios.create({ baseURL: API_URL, withCredentials: true });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  const slug = currentSlug();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (slug) config.headers['X-Tenant-Slug'] = slug;
  return config;
});

// ERR-1 §1.3 rule 2 — single-flight refresh: concurrent 401s share ONE refresh
// promise; queued requests retry once it resolves.
let isRefreshing = false;
let queue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];
function flushQueue(error: unknown, token: string | null): void {
  queue.forEach((p) => (error ? p.reject(error) : token ? p.resolve(token) : undefined));
  queue = [];
}

// ERR-1 §1.3 rule 3 — refresh failed / no session: clear tokens, stash a one-shot
// notice, redirect to login. Never surface an axios/internal string.
function onSessionExpired(): void {
  useAuthStore.getState().logout();
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
    } catch {
      /* private-mode / storage disabled — the redirect still happens */
    }
    const isSuperAdmin = window.location.pathname.startsWith('/super-admin');
    window.location.href = isSuperAdmin ? '/super-admin/login' : '/login';
  }
}

api.interceptors.response.use(
  (res) => {
    // A 2xx body with success:false is an application-level error.
    if (res.data?.success === false) {
      const code = res.data?.error?.code ?? 'ERROR';
      const msg = res.data?.error?.message ?? 'Request failed';
      return Promise.reject(new Error(`${code}: ${msg}`));
    }
    return res;
  },
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    // REG-1: a forced-change 403 is a redirect to change-password, never a hard error.
    const code = (error.response?.data as { error?: { code?: string } } | undefined)?.error?.code;
    if (
      error.response?.status === 403 &&
      code === 'PASSWORD_CHANGE_REQUIRED' &&
      typeof window !== 'undefined' &&
      window.location.pathname !== '/change-password'
    ) {
      window.location.href = '/change-password';
      return Promise.reject(error);
    }

    // §1.3 rule 1 — not a refreshable 401 (auth endpoint, already retried, or not
    // 401): surface the server envelope directly.
    if (
      error.response?.status !== 401 ||
      !original ||
      original._retry ||
      isAuthEndpoint(original.url)
    ) {
      return Promise.reject(error);
    }

    // §1.3 rule 2 — a refresh is already in flight: queue and retry after it lands.
    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => queue.push({ resolve, reject })).then(
        (token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        },
      );
    }

    original._retry = true;
    isRefreshing = true;
    try {
      const slug = currentSlug();
      const { data } = await axios.post(
        `${API_URL}/auth/refresh`,
        {},
        { withCredentials: true, headers: slug ? { 'X-Tenant-Slug': slug } : {} },
      );
      const token: string = data.data.accessToken;
      useAuthStore.getState().setAccessToken(token);
      flushQueue(null, token);
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    } catch (refreshErr) {
      flushQueue(refreshErr, null);
      onSessionExpired();
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  },
);

/** Raw axios instance without interceptors — for session restore & refresh calls. */
export const rawApi = axios.create({ baseURL: API_URL, withCredentials: true });

export default api;
