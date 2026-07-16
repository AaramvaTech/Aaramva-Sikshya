// ERR-1 §1.3 — auth-endpoint exclusion gate + session-expiry store flag.
// Kept as .js (like the other mobile tests) so it runs under jest-expo without
// being pulled into `tsc --noEmit` (which lacks jest global types here).
import { AUTH_ENDPOINTS, isAuthEndpoint } from '../lib/authEndpoints';
import { useAuthStore } from '../store/auth';

describe('ERR-1 §1.3 rule 1 — auth-endpoint exclusion (isAuthEndpoint)', () => {
  it('matches every excluded auth endpoint (exact + with query suffix)', () => {
    expect(isAuthEndpoint('/auth/login')).toBe(true);
    expect(isAuthEndpoint('/auth/refresh')).toBe(true);
    expect(isAuthEndpoint('/auth/forgot-password')).toBe(true);
    expect(isAuthEndpoint('/auth/reset-password')).toBe(true);
    expect(isAuthEndpoint('/auth/login?next=1')).toBe(true);
  });

  it('does NOT match protected endpoints (which must still refresh on 401)', () => {
    expect(isAuthEndpoint('/auth/me')).toBe(false);
    expect(isAuthEndpoint('/auth/change-password')).toBe(false);
    expect(isAuthEndpoint('/students/me')).toBe(false);
    expect(isAuthEndpoint('/attendance/students/x/summary')).toBe(false);
    expect(isAuthEndpoint(undefined)).toBe(false);
    expect(isAuthEndpoint('')).toBe(false);
  });

  it('covers exactly the four spec §1.3 endpoints', () => {
    expect([...AUTH_ENDPOINTS].sort()).toEqual(
      ['/auth/forgot-password', '/auth/login', '/auth/refresh', '/auth/reset-password'].sort(),
    );
  });
});

describe('ERR-1 §1.3 rule 3 — sessionExpired store flag', () => {
  it('defaults false, sets on setSessionExpired, clears on clearSessionExpired', () => {
    useAuthStore.setState({ sessionExpired: false });
    expect(useAuthStore.getState().sessionExpired).toBe(false);

    useAuthStore.getState().setSessionExpired();
    expect(useAuthStore.getState().sessionExpired).toBe(true);

    useAuthStore.getState().clearSessionExpired();
    expect(useAuthStore.getState().sessionExpired).toBe(false);
  });

  it('clearSession preserves the sessionExpired flag (login screen reads it post-logout)', () => {
    useAuthStore.setState({ sessionExpired: false, sessions: [], activeSessionId: null, slug: 'demo' });
    useAuthStore.getState().setSessionExpired();
    useAuthStore.getState().clearSession();
    expect(useAuthStore.getState().sessionExpired).toBe(true);
    expect(useAuthStore.getState().status).toBe('unauthed');
  });
});
