// app/api/tokenlist/route.ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

type JupToken = {
  address: string;      // mint
  symbol?: string | null;
  name?: string | null;
  logoURI?: string | null;
  verified?: boolean | null;
  decimals?: number | null;
};

type ListRow = {
  symbol: string | null;
  name: string | null;
  logoURI?: string;
  verified?: boolean;
  decimals?: number | null;
};

function tidy(x: unknown): string | null {
  if (!x) return null;
  const s = String(x).replace(/\0/g, '').trim();
  return s || null;
}

async function fetchList(url: string): Promise<JupToken[] | null> {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()) as JupToken[];
  } catch { return null; }
}

export async function GET() {
  try {
    // 1) Önce STRICT (otorite)
    const strictArr = await fetchList('https://tokens.jup.ag/strict');
    // 2) Sonra ALL (kapsayıcı)
    const allArr    = await fetchList('https://tokens.jup.ag/all');

    const out: Record<string, ListRow> = {};

    // STRICT: temel harita
    if (strictArr) {
      for (const t of strictArr) {
        const mint = tidy(t.address);
        if (!mint) continue;
        out[mint] = {
          symbol: tidy(t.symbol),
          name: tidy(t.name),
          logoURI: tidy(t.logoURI) ?? undefined,
          verified: Boolean(t.verified ?? true),
          decimals: typeof t.decimals === 'number' && Number.isFinite(t.decimals) ? t.decimals : null,
        };
      }
    }

    // ALL: sadece eksik alanları TAMAMLA (STRICT’i EZME!)
    if (allArr) {
      for (const t of allArr) {
        const mint = tidy(t.address);
        if (!mint) continue;

        const row = out[mint] ?? {
          symbol: null, name: null, logoURI: undefined, verified: false, decimals: null,
        };

        const aSym = tidy(t.symbol);
        const aNam = tidy(t.name);
        const aLogo = tidy(t.logoURI) ?? undefined;
        const aDec = typeof t.decimals === 'number' && Number.isFinite(t.decimals) ? t.decimals : null;

        if (!row.symbol && aSym) row.symbol = aSym;
        if (!row.name   && aNam) row.name   = aNam;
        if (!row.logoURI && aLogo) row.logoURI = aLogo;
        if (row.decimals == null && aDec != null) row.decimals = aDec;

        out[mint] = row;
      }
    }

    // İsteğe bağlı: kendi DB token_registry ile buradan merge edebilirsin (STRICT > REGISTRY > ALL sırası)

    return NextResponse.json({ ok: true, data: out });
  } catch (e) {
    console.error('[TOKENLIST] exception', e);
    return NextResponse.json({ ok: true, data: {} });
  }
}
