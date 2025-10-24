export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

// küçük yardımlar
const tidy = (x: any) => {
  if (!x) return null;
  const s = String(x).replace(/\0/g, '').trim();
  return s || null;
};
const sanitizeSym = (s: string | null) => {
  if (!s) return null;
  const z = s.toUpperCase().replace(/[^A-Z0-9.$_/-]/g, '').slice(0, 16);
  return z || null;
};

async function fetchJSON<T>(url: string, ms = 8000): Promise<{ ok: boolean; data?: T; err?: string }> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      cache: 'no-store',
      signal: ctrl.signal,
      headers: { 'user-agent': 'coincarnation-symbol/1.0', accept: 'application/json' },
    });
    if (!r.ok) return { ok: false, err: `HTTP ${r.status}` };
    const j = (await r.json()) as T;
    return { ok: true, data: j };
  } catch (e: any) {
    return { ok: false, err: e?.name === 'AbortError' ? 'timeout' : String(e?.message || e) };
  } finally {
    clearTimeout(id);
  }
}

export async function GET(req: NextRequest) {
  const mint = tidy(req.nextUrl.searchParams.get('mint'));
  if (!mint) return NextResponse.json({ ok: false, error: 'missing_mint' }, { status: 400 });

  // 1) Jupiter tokenlist proxy'miz
  try {
    const j = await (await fetch(`${req.nextUrl.origin}/api/tokenlist`, { cache: 'no-store' })).json();
    const row = j?.data?.[mint];
    const sym1 = sanitizeSym(tidy(row?.symbol));
    const name1 = tidy(row?.name);
    if (sym1) {
      return NextResponse.json({ ok: true, symbol: sym1, name: name1, source: 'tokenlist' }, { status: 200 });
    }
  } catch {}

  // 2) DexScreener (çok geniş kapsama alanı)
  try {
    type DexResp = { pairs?: Array<{ baseToken?: { symbol?: string; name?: string } }> };
    const dx = await fetchJSON<DexResp>(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mint)}`);
    const pair = dx.ok ? (dx.data?.pairs?.[0] ?? null) : null;
    const sym2 = sanitizeSym(tidy(pair?.baseToken?.symbol));
    const name2 = tidy(pair?.baseToken?.name);
    if (sym2) {
      return NextResponse.json({ ok: true, symbol: sym2, name: name2, source: 'dexscreener' }, { status: 200 });
    }
  } catch {}

  // 3) On-chain (Metaplex) — mevcut route'unu kullan
  try {
    const oc = await (await fetch(`${req.nextUrl.origin}/api/tokenmeta?mint=${encodeURIComponent(mint)}`, { cache: 'no-store' })).json();
    const sym3 = sanitizeSym(tidy(oc?.symbol));
    const name3 = tidy(oc?.name);
    if (sym3 || name3) {
      return NextResponse.json({ ok: true, symbol: sym3, name: name3, source: 'onchain' }, { status: 200 });
    }
  } catch {}

  return NextResponse.json({ ok: true, symbol: null, name: null, source: 'none' }, { status: 200 });
}
