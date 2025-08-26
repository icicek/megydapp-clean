// app/api/admin/is-allowed/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get('wallet')?.trim();
  if (!wallet) {
    return NextResponse.json({ success: false, error: 'wallet required' }, { status: 400 });
  }
  const allowed = (process.env.ADMIN_WALLET || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // ENV boşsa bilinçli olarak false dönüyoruz (güvenlik)
  const isAllowed = allowed.length > 0 && allowed.includes(wallet);
  return NextResponse.json({ success: true, allowed: isAllowed });
}
