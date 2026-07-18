import { describe, it, expect, vi } from 'vitest';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';

vi.mock('@/store/auth.store', () => ({
  useAuthStore: { getState: () => ({ accessToken: 'tok123' }) },
}));
vi.mock('@/store/tenant.store', () => ({
  useTenantStore: { getState: () => ({ slug: 'global-active-school' }) },
}));

import api from '../api';

function stubAdapter() {
  let captured: AxiosRequestConfig | undefined;
  api.defaults.adapter = async (config: AxiosRequestConfig): Promise<AxiosResponse> => {
    captured = config;
    return {
      data: { success: true, data: {} },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: config as AxiosRequestConfig,
    } as AxiosResponse;
  };
  return () => captured;
}

describe('api request interceptor — X-Tenant-Slug', () => {
  it('applies the globally active tenant slug when the caller sets none', async () => {
    const getCaptured = stubAdapter();
    await api.get('/students');
    expect(getCaptured()!.headers!['X-Tenant-Slug']).toBe('global-active-school');
  });

  it('does NOT clobber an explicit per-request X-Tenant-Slug (super-admin logo presign for a different school)', async () => {
    const getCaptured = stubAdapter();
    await api.post(
      '/files/presign-upload',
      { kind: 'school-logo' },
      { headers: { 'X-Tenant-Slug': 'target-school' } },
    );
    expect(getCaptured()!.headers!['X-Tenant-Slug']).toBe('target-school');
  });
});
