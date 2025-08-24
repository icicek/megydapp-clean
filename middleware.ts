import { NextResponse, NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// Use the same secret that signs your admin JWTs
const SECRET = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET ?? '');

async function verify(token: string) {
  // Throws if invalid/expired or alg mismatch
  await jwtVerify(token, SECRET);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protect /admin and subpaths, except /admin/login
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    const token = req.cookies.get('coincarnation_admin')?.value;
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      return NextResponse.redirect(url);
    }
    try {
      await verify(token);
    } catch {
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
