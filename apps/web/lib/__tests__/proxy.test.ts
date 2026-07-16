import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../../proxy';

function req(path: string, cookie?: string) {
  return new NextRequest(new URL(path, 'http://localhost:3000'), cookie ? { headers: { cookie } } : undefined);
}

describe('proxy — super-admin auth-presence redirects', () => {
  // Regression: a super-admin session is access-token-only (no refresh token), so
  // the spoofable `_auth` marker outlives it. The login page must stay reachable
  // even with a stale marker — otherwise the user is trapped on the empty dashboard.
  it('does NOT bounce /super-admin/login to the dashboard on a stale _auth marker', () => {
    const res = proxy(req('/super-admin/login', '_auth=1'));
    expect(res.headers.get('location')).toBeNull();
    expect(res.status).not.toBe(307);
  });

  it('still redirects an unauthed visitor off a protected super-admin page to login', () => {
    const res = proxy(req('/super-admin/dashboard'));
    expect(res.headers.get('location')).toContain('/super-admin/login');
  });

  it('lets a marked visitor reach a protected super-admin page (session enforced client-side)', () => {
    const res = proxy(req('/super-admin/dashboard', '_auth=1'));
    expect(res.headers.get('location')).toBeNull();
  });
});
