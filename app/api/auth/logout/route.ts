// app/api/auth/logout/route.ts

import { NextResponse } from 'next/server';

import {
  USER_AUTH_COOKIE,
  getExpiredUserCookieOptions,
} from '@/app/api/_lib/user-auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json(
    {
      ok: true,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );

  response.cookies.set(
    USER_AUTH_COOKIE,
    '',
    getExpiredUserCookieOptions()
  );

  return response;
}