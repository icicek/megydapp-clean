// app/api/admin/auth/logout/route.ts
import { NextResponse } from 'next/server';
import { httpErrorFrom } from '@/app/api/_lib/http';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const res = NextResponse.json({ success: true });
    res.cookies.set('coincarnation_admin', '', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 0,
      path: '/',
    });
    return res;
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}
