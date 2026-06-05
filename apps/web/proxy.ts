import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const hostname = request.headers.get('host') ?? '';
  const subdomain = hostname.split('.')[0].split(':')[0];

  // Dev override: ?tenant=slug in URL for local testing
  const devSlug = request.nextUrl.searchParams.get('tenant');
  const slug = devSlug || subdomain;

  const response = NextResponse.next();
  response.headers.set('x-tenant-slug', slug);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
