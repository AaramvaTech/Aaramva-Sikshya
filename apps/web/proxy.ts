import { NextRequest, NextResponse } from 'next/server';
import { AUTH_MARKER } from '@/lib/auth-marker';

/**
 * SEC-2 / Task 2 — auth-PRESENCE edge guard + tenant-slug resolution.
 *
 * NOTE ON THE FILENAME: in Next.js 16 the "middleware" file convention was renamed
 * to `proxy` (same functionality) — so this file IS the app's middleware. Only one
 * proxy file is allowed per project, so the auth guard is merged here alongside the
 * pre-existing tenant-slug header logic.
 *
 * The auth half only answers "does the browser look logged in?" by checking the
 * `_auth` marker cookie (lib/auth-marker.ts). It deliberately does NOT decode,
 * verify, or trust the cookie's contents — the marker is spoofable by design and
 * carries no role. Role gating happens client-side in the shell from ROUTE_ACCESS,
 * and the ACTUAL security boundary is the httpOnly refresh token plus the backend's
 * `@Roles()` RBAC on every request. We cannot read the real `refresh_token` here:
 * it is httpOnly and scoped to the API origin's `/api/v1/auth` path, so the browser
 * never sends it to the Next server.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasMarker = request.cookies.get(AUTH_MARKER)?.value === '1';

  // ── Auth-presence redirects ────────────────────────────────────────────────
  // Super-admin portal has its own login screen; keep it self-contained.
  if (pathname.startsWith('/super-admin')) {
    const isSuperLogin = pathname === '/super-admin/login';
    if (!hasMarker && !isSuperLogin) {
      return NextResponse.redirect(new URL('/super-admin/login', request.url));
    }
    if (hasMarker && isSuperLogin) {
      return NextResponse.redirect(new URL('/super-admin/dashboard', request.url));
    }
  } else {
    // School portal + root.
    const isLogin = pathname === '/login';
    if (!hasMarker && !isLogin) {
      const url = new URL('/login', request.url);
      if (pathname !== '/') url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
    if (hasMarker && isLogin) {
      // Generic hint only — proxy doesn't know the role. The login page and the
      // shell perform the role-aware redirect (homeRoute) once the session hydrates.
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // ── Pass through, preserving tenant-slug resolution ────────────────────────
  // Dev override: ?tenant=slug in URL for local testing; else subdomain.
  const hostname = request.headers.get('host') ?? '';
  const subdomain = hostname.split('.')[0].split(':')[0];
  const devSlug = request.nextUrl.searchParams.get('tenant');
  const slug = devSlug || subdomain;

  const response = NextResponse.next();
  response.headers.set('x-tenant-slug', slug);
  return response;
}

/**
 * Run on everything EXCEPT Next internals and static/public assets, so real page
 * navigations are guarded but assets aren't intercepted. (The web app has no
 * server API routes; the backend is a separate origin.)
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo.png|icon.png|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)',
  ],
};
