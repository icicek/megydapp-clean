// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import * as jose from 'jose';

const ADMIN_COOKIE = 'coincarnation_admin';

// JWT imzası
const SECRET_RAW = process.env.ADMIN_JWT_SECRET || '';
const SECRET = SECRET_RAW ? new TextEncoder().encode(SECRET_RAW) : null;

// Public admin route (redirect loop önler)
function isPublicAdminRoute(pathname: string): boolean {
  return pathname === '/admin/login';
}

// ENV root admin kontrolü (DB'ye bakmadan, sadece ENV)
// Not: ADMIN_WALLETS (çoğul) kullan; geriye dönük ADMIN_WALLET desteği
function isEnvAdmin(wallet: string): boolean {
  const raw = (process.env.ADMIN_WALLETS || process.env.ADMIN_WALLET || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (raw.length === 0) return false; // fail-closed
  return raw.includes(wallet);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /admin ve /docs/dev altını koru; diğer rotalar → geç
  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');
  const isDevNotesPath = pathname === '/docs/dev' || pathname.startsWith('/docs/dev/');
  if (!isAdminPath && !isDevNotesPath) return NextResponse.next();

  // /admin/login public
  if (isAdminPath && isPublicAdminRoute(pathname)) return NextResponse.next();

  // Server secret yoksa → login
  if (!SECRET) {
    const url = new URL('/admin/login', req.url);
    url.searchParams.set('e', 'server-config');
    return NextResponse.redirect(url);
  }

  // Cookie zorunlu
  const tok = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!tok) {
    const url = new URL('/admin/login', req.url);
    url.searchParams.set('e', 'missing');
    return NextResponse.redirect(url);
  }

  try {
    // JWT doğrula
    const { payload } = await jose.jwtVerify(tok, SECRET);

    // JWT claim'leri
    const role = String(payload.role || '');
    const wallet = String(payload.sub || '');

    if (role !== 'admin' || !wallet) {
      const url = new URL('/admin/login', req.url);
      url.searchParams.set('e', 'not-allowed');
      return NextResponse.redirect(url);
    }

    // /admin/control → yalnızca ENV root admin
    if (pathname.startsWith('/admin/control')) {
      if (!isEnvAdmin(wallet)) {
        const url = new URL('/admin/login', req.url);
        url.searchParams.set('e', 'not-allowed');
        return NextResponse.redirect(url);
      }
    }

    // Diğer tüm korunan sayfalar → role: 'admin' yeterli
    return NextResponse.next();
  } catch {
    const url = new URL('/admin/login', req.url);
    url.searchParams.set('e', 'invalid');
    return NextResponse.redirect(url);
  }
}

// Korumalı alanlar: /admin* ve /docs/dev*
export const config = {
  matcher: ['/admin', '/admin/:path*', '/docs/dev', '/docs/dev/:path*'],
};
