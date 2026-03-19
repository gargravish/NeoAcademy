import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

const PUBLIC_ROUTES = ['/login', '/setup', '/api/auth', '/api/setup'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Forward pathname so server components (e.g. FirstRunRedirect) can read it
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);
  const next = () => NextResponse.next({ request: { headers: requestHeaders } });

  // Allow static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/health') ||
    pathname === '/favicon.ico' ||
    pathname === '/apple-icon.png'
  ) {
    return next();
  }

  // Allow public routes
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return next();
  }

  // Check for session cookie (fast, no DB hit)
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return next();
}

export const config = {
  matcher: [
    // Match all routes except static files
    '/((?!_next/static|_next/image|favicon.ico|apple-icon.png).*)',
  ],
};
