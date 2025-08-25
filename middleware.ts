// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import * as jose from 'jose';

const ADMIN_COOKIE = 'coincarnation_admin';

const SECRET_RAW = process.env.ADMIN_JWT_SECRET || '';
const SECRET = SECRET_RAW ? new TextEncoder().encode(SECRET_RAW) : null;

// Fail-closed allowlist
function isAllowed(wallet: string): boolean {
  const allowed = (process.env.ADMIN_WALLET || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return false; // env boşsa kimseye izin verme
  return allowed.includes(wallet);
}

// /admin altında auth'suz erişilecek rotalar (redirect loop'u önler)
function isPublicAdminRoute(pathname: string): boolean {
  return pathname === '/admin/login';
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /admin dışındaki rotalar → geç
  if (!pathname.startsWith('/admin')) return NextResponse.next();

  // /admin/login → her zaman geç (aksi halde loop olur)
  if (isPublicAdminRoute(pathname)) return NextResponse.next();

  // Cookie yoksa login'e gönder
  const tok = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!tok) {
    const url = new URL('/admin/login', req.url);
    url.searchParams.set('e', 'missing');
    return NextResponse.redirect(url);
  }

  // SECRET yoksa güvenlik için engelle
  if (!SECRET) {
    const url = new URL('/admin/login', req.url);
    url.searchParams.set('e', 'server-config');
    return NextResponse.redirect(url);
  }

  try {
    // JWT doğrula
    const { payload } = await jose.jwtVerify(tok, SECRET);
    const wallet = String(payload.sub || '');

    // Allowlist kontrolü
    if (!isAllowed(wallet)) {
      const url = new URL('/admin/login', req.url);
      url.searchParams.set('e', 'not-allowed');
      return NextResponse.redirect(url);
    }

    // Her şey yolunda → devam
    return NextResponse.next();
  } catch {
    const url = new URL('/admin/login', req.url);
    url.searchParams.set('e', 'invalid');
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ['/admin/:path*'],
};
