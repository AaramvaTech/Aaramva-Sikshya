/**
 * SEC-2 / D1 — the `_auth` session-presence marker cookie.
 *
 * ⚠️ THIS COOKIE IS SPOOFABLE BY DESIGN AND GRANTS NOTHING. It is a non-httpOnly,
 * client-set flag whose ONLY purpose is to let the Next.js proxy (the Next 16
 * renaming of "middleware", see proxy.ts) make a fast edge redirect decision
 * (send a logged-out visitor to /login, keep a logged-in one out of /login)
 * without a round-trip. It carries no identity and no role.
 *
 * Why it exists: the real refresh token (`refresh_token`) is httpOnly, SameSite=
 * strict, and scoped to the API origin's `/api/v1/auth` path, so it is never sent
 * to the Next server on page navigations — middleware cannot see it. This marker
 * fills that gap for UX only.
 *
 * The actual security boundary is: (1) the httpOnly refresh token, and (2) the
 * backend's `@Roles()` RBAC on every endpoint. Forging `_auth=1` lets a user reach
 * a page shell that immediately fails to hydrate a session and bounces them back —
 * it exposes no data.
 *
 * Lifecycle (kept in sync with auth state in store/auth.store.ts):
 *   set   → on login / refresh success / impersonation handoff
 *   clear → on logout AND on failed refresh (so a dead session can't leave a stale
 *           marker bouncing the user between middleware and the shell)
 */
export const AUTH_MARKER = '_auth';

const isProd = process.env.NODE_ENV === 'production';
// Match the refresh token's ~7-day lifetime so the marker survives browser
// restarts the same way the session does. Staleness self-heals: a failed refresh
// clears it.
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function setAuthMarker(): void {
  if (typeof document === 'undefined') return;
  document.cookie =
    `${AUTH_MARKER}=1; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax` +
    (isProd ? '; secure' : '');
}

export function clearAuthMarker(): void {
  if (typeof document === 'undefined') return;
  document.cookie =
    `${AUTH_MARKER}=; path=/; max-age=0; samesite=lax` + (isProd ? '; secure' : '');
}
