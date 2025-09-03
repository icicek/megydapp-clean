// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import * as jose from 'jose';

const ADMIN_COOKIE = 'coincarnation_admin';

// JWT imzası
const SECRET_RAW = process.env.ADMIN_JWT_SECRET || '';
const SECRET = SECRET_RAW ? new TextEncoder().encode(SECRET_RAW) : null;

// Sadece login sayfasını auth'suz bırak (redirect loop önler)
function isPublicAdminRoute(pathname: string): boolean {
  return pathname === '/admin/login';
}

// ENV root admin kontrolü (DB'ye bakmadan, sadece ENV)
function isEnvAdmin(wallet: string): boolean {
  const allowed = (process.env.ADMIN_WALLET || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return false; // fail-closed
  return allowed.includes(wallet);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /admin dışındaki rotalar → olduğu gibi geç
  if (!pathname.startsWith('/admin')) return NextResponse.next();

  // public admin route → geç
  if (isPublicAdminRoute(pathname)) return NextResponse.next();

  // Server secret yoksa güvenlik için login'e gönder
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

    // JWT claim'lerinden yetki kontrolü
    const role = String(payload.role || '');
    const wallet = String(payload.sub || '');

    // Login sırasında admin allowlist'inden geçmiş olmalı
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

    // Diğer tüm /admin sayfaları → role: 'admin' yeterli (DB/ENV allowlist login'de geçti)
    return NextResponse.next();
  } catch {
    const url = new URL('/admin/login', req.url);
    url.searchParams.set('e', 'invalid');
    return NextResponse.redirect(url);
  }
}

// Kök /admin de korunsun diye matcher'a /admin ekliyoruz
export const config = {
  matcher: ['/admin', '/admin/:path*'],
};
