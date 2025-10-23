// app/api/tokenlist/route.ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

type JupToken = {
  address: string;      // mint
  symbol?: string | null;
  name?: string | null;
  logoURI?: string | null;
  extensions?: Record<string, string> | null;
  tags?: string[] | null;
  verified?: boolean | null;
  decimals?: number | null;
};

type ListRow = {
  symbol: string;
  name: string;
  logoURI?: string;
  verified?: boolean;
  decimals?: number | null;
};

function tidy(x: unknown): string | null {
  if (!x) return null;
  const s = String(x).replace(/\0/g, '').trim();
  return s || null;
}

export async function GET() {
  try {
    // 🔧 ÖNEMLİ: Doğru domain — tokens.jup.ag
    const url = 'https://tokens.jup.ag/strict'; // güvenli / doğrulanmış liste
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) {
      console.error('[TOKENLIST] jup fetch failed', r.status, r.statusText);
      return NextResponse.json({ ok: true, data: {} });
    }

    const arr = (await r.json()) as JupToken[];
    const map: Record<string, ListRow> = {};

    for (const t of arr) {
      const mint = tidy(t.address);
      if (!mint) continue;

      const symbol = tidy(t.symbol);
      const name = tidy(t.name);
      const logoURI = tidy(t.logoURI) ?? undefined;
      const verified = Boolean(t.verified);
      const decimals =
        typeof t.decimals === 'number' && Number.isFinite(t.decimals)
          ? t.decimals
          : null;

      if (symbol || name) {
        map[mint] = {
          symbol: symbol ?? '',
          name: name ?? '',
          logoURI,
          verified,
          decimals,
        };
      }
    }

    // İstersen burada kendi DB kayıtlarınla merge edebilirsin
    // (token_registry → symbol/name override). Şimdilik saf Jupiter.

    return NextResponse.json({ ok: true, data: map });
  } catch (e) {
    console.error('[TOKENLIST] exception', e);
    return NextResponse.json({ ok: true, data: {} });
  }
}
