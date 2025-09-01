// app/api/admin/whoami/route.ts
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/_lib/jwt';
import { httpErrorFrom } from '@/app/api/_lib/http';

export async function GET(req: Request) {
  try {
    const wallet = await requireAdmin(req); // Cookie/Authorization doğrulaması
    return NextResponse.json({ success: true, wallet });
  } catch (e: any) {
    const { status, body } = httpErrorFrom(e, 500);
    return NextResponse.json(body, { status });
  }
}
