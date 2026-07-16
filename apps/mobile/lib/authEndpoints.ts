// ERR-1 §1.3 rule 1 — the axios refresh flow must NEVER run for these endpoints.
// A 401 from them surfaces the server envelope directly to the caller (e.g. a
// wrong login shows "Invalid email or password.", not an interceptor-internal
// string like "No refresh token available"). Kept dependency-free so it is unit
// testable without pulling in axios / expo native modules.
export const AUTH_ENDPOINTS = [
  '/auth/login',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/reset-password',
] as const;

export function isAuthEndpoint(url?: string): boolean {
  return !!url && AUTH_ENDPOINTS.some((p) => url === p || url.startsWith(p));
}
