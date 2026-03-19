// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import * as jose from 'jose';

const ADMIN_COOKIE = 'coincarnation_admin';

const SECRET_RAW = process.env.ADMIN_JWT_SECRET || '';
const SECRET = SECRET_RAW ? new TextEncoder().encode(SECRET_RAW) : null;

function isPublicAdminPageRoute(pathname: string): boolean {
  return pathname === '/admin/login';
}

function isPublicAdminApiRoute(pathname: string): boolean {
  return (
    pathname === '/api/admin/is-allowed' ||
    pathname === '/api/admin/auth/nonce' ||
    pathname === '/api/admin/auth/verify' ||
    pathname === '/api/admin/config/claim_open'
  );
}

function isEnvAdmin(wallet: string): boolean {
  const listRaw =
    process.env.ADMIN_WALLETS ||
    process.env.ADMIN_WALLET ||
    '';

  const allowed = listRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (allowed.length === 0) return false;
  return allowed.includes(wallet);
}

function isProtectedPath(pathname: string): boolean {
  return (
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/api/admin' ||
    pathname.startsWith('/api/admin/') ||
    pathname === '/docs/dev' ||
    pathname.startsWith('/docs/dev/')
  );
}

function isApiPath(pathname: string): boolean {
  return pathname === '/api/admin' || pathname.startsWith('/api/admin/');
}

function buildAdminLoginRedirect(req: NextRequest, code: string) {
  const url = new URL('/admin/login', req.url);
  url.searchParams.set('e', code);
  return NextResponse.redirect(url);
}

function buildApiAuthError(code: string, status: number) {
  return NextResponse.json(
    { success: false, error: code },
    { status }
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  // Public admin page
  if (!isApiPath(pathname) && isPublicAdminPageRoute(pathname)) {
    return NextResponse.next();
  }

  // Public admin API routes (login/bootstrap/visibility)
  if (isApiPath(pathname) && isPublicAdminApiRoute(pathname)) {
    return NextResponse.next();
  }

  if (!SECRET) {
    if (isApiPath(pathname)) {
      return buildApiAuthError('server_secret_missing', 500);
    }
    return buildAdminLoginRedirect(req, 'server-config');
  }

  const tok = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!tok) {
    if (isApiPath(pathname)) {
      return buildApiAuthError('auth_missing', 401);
    }
    return buildAdminLoginRedirect(req, 'missing');
  }

  try {
    const { payload } = await jose.jwtVerify(tok, SECRET);

    const role = String(payload.role || '');
    const wallet = String(payload.sub || '');

    if (role !== 'admin' || !wallet) {
      if (isApiPath(pathname)) {
        return buildApiAuthError('auth_invalid', 401);
      }
      return buildAdminLoginRedirect(req, 'not-allowed');
    }

    // Admin allowlist check for all protected admin/docs paths
    if (!isEnvAdmin(wallet)) {
      if (isApiPath(pathname)) {
        return buildApiAuthError('auth_forbidden', 403);
      }
      return buildAdminLoginRedirect(req, 'not-allowed');
    }

    return NextResponse.next();
  } catch {
    if (isApiPath(pathname)) {
      return buildApiAuthError('auth_invalid', 401);
    }
    return buildAdminLoginRedirect(req, 'invalid');
  }
}

export const config = {
  matcher: [
    '/admin',
    '/admin/:path*',
    '/api/admin',
    '/api/admin/:path*',
    '/docs/dev',
    '/docs/dev/:path*',
  ],
};