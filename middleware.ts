// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import * as jose from 'jose';

const ADMIN_COOKIE = 'coincarnation_admin';

const SECRET_RAW = process.env.ADMIN_JWT_SECRET || '';
const SECRET = SECRET_RAW ? new TextEncoder().encode(SECRET_RAW) : null;

// /admin altında auth'suz erişilecek rotalar (redirect loop'u önler)
function isPublicAdminRoute(pathname: string): boolean {
  return pathname === '/admin/login';
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
    const sub = String(payload.sub || '');
    if (role !== 'admin' || !sub) {
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

// Kök /admin de korunsun diye matcher'a /admin ekledik
export const config = {
  matcher: ['/admin', '/admin/:path*'],
};
