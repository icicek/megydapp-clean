//app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';
import { USER_AUTH_COOKIE } from '@/app/api/_lib/user-auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const res = NextResponse.json({
    ok: true,
  });

  res.cookies.set(USER_AUTH_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return res;
}