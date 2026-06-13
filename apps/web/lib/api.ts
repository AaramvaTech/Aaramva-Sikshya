import axios from 'axios';
import { useAuthStore } from '@/store/auth.store';
import { useTenantStore } from '@/store/tenant.store';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  const slug =
    useTenantStore.getState().slug ??
    (typeof window !== 'undefined' ? localStorage.getItem('tenant-slug') : null);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (slug) config.headers['X-Tenant-Slug'] = slug;
  return config;
});

api.interceptors.response.use(
  (res) => {
    if (res.data?.success === false) {
      const code = res.data?.error?.code ?? 'ERROR';
      const msg = res.data?.error?.message ?? 'Request failed';
      return Promise.reject(new Error(`${code}: ${msg}`));
    }
    return res;
  },
  async (error) => {
    if (error.response?.status === 401 && !(error.config as any)._retry) {
      (error.config as any)._retry = true;
      try {
        const slug =
          useTenantStore.getState().slug ??
          (typeof window !== 'undefined' ? localStorage.getItem('tenant-slug') : null);
        const { data } = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'}/auth/refresh`,
          {},
          {
            withCredentials: true,
            headers: slug ? { 'X-Tenant-Slug': slug } : {},
          },
        );
        const token: string = data.data.accessToken;
        useAuthStore.getState().setAccessToken(token);
        error.config.headers.Authorization = `Bearer ${token}`;
        return api(error.config);
      } catch {
        useAuthStore.getState().logout();
        if (typeof window !== 'undefined') {
          const isSuperAdmin = window.location.pathname.startsWith('/super-admin');
          window.location.href = isSuperAdmin ? '/super-admin/login' : '/login';
        }
      }
    }
    return Promise.reject(error);
  },
);

/** Raw axios instance without interceptors — for session restore & refresh calls. */
export const rawApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1',
  withCredentials: true,
});

export default api;
