// app/api/admin/whoami/route.ts
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/_lib/jwt'; // sende bu dosyadaydı

export async function GET(req: Request) {
  try {
    const wallet = await requireAdmin(req); // Cookie'yi/Authorization'ı doğrular
    return NextResponse.json({ success: true, wallet });
  } catch {
    return NextResponse.json({ success: false }, { status: 401 });
  }
}
