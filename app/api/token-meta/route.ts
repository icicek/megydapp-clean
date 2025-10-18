// app/api/token-meta/route.ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    let mint = (url.searchParams.get('mint') || '').trim();
    if (!mint) {
      // İstersen 200 döndürüp note ekleyebilirsin; burada 200 tercih ettim
      return NextResponse.json({ ok: true, item: null, note: 'Provide ?mint=...' });
    }
    if (mint.toUpperCase() === 'SOL') mint = WSOL_MINT;

    const multi = new URL('/api/tokenmeta', url.origin);
    multi.searchParams.set('mints', mint);

    const res = await fetch(multi.toString(), { cache: 'no-store' });
    const j = await res.json(); // { success, data }
    const item = j?.data?.[mint] || null;

    return NextResponse.json({
      ok: true,
      item,
      source: 'tokenmeta',
    });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      item: null,
      error: e?.message || String(e),
    });
  }
}
