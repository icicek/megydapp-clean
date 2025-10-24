// app/api/tokenlist/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // önemli: edge yerine nodejs

import { NextRequest, NextResponse } from 'next/server';

type JupToken = {
  address: string;
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

const TIDY = (x: any) => {
  if (!x) return null;
  const s = String(x).replace(/\0/g, '').trim();
  return s || null;
};

// küçük yardımcı: timeout'lu fetch
async function fetchWithTimeout(url: string, ms = 8000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      cache: 'no-store',
      signal: ctrl.signal,
      headers: { 'user-agent': 'coincarnation-tokenlist/1.0 (+https://coincarnation.com)' },
    });
    return r;
  } finally {
    clearTimeout(id);
  }
}

async function getList(url: string, tries = 2): Promise<{ ok: boolean; data: JupToken[] | null; err?: string }> {
  let lastErr = '';
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetchWithTimeout(url, 8000);
      if (!r.ok) {
        lastErr = `HTTP ${r.status} ${r.statusText}`;
        continue;
      }
      const arr = (await r.json()) as JupToken[];
      return { ok: true, data: arr };
    } catch (e: any) {
      lastErr = e?.name === 'AbortError' ? 'timeout' : String(e?.message || e);
    }
  }
  return { ok: false, data: null, err: lastErr };
}

export async function GET(req: NextRequest) {
  const debug = req.nextUrl.searchParams.get('debug') === '1';
  const diag: any = {};

  try {
    // 1) STRICT (otorite)
    const strictRes = await getList('https://tokens.jup.ag/strict');
    if (debug) diag.strict = strictRes.ok ? `ok:${strictRes.data?.length}` : `fail:${strictRes.err}`;

    // 2) ALL (kapsayıcı)
    const allRes = await getList('https://tokens.jup.ag/all');
    if (debug) diag.all = allRes.ok ? `ok:${allRes.data?.length}` : `fail:${allRes.err}`;

    if (!strictRes.ok && !allRes.ok) {
      // tamamen başarısız → açıkça hata döndür
      return NextResponse.json({ ok: false, error: 'jupiter_fetch_failed', diag }, { status: 502 });
    }

    const out: Record<string, ListRow> = {};

    // STRICT temel
    if (strictRes.ok && strictRes.data) {
      for (const t of strictRes.data) {
        const mint = TIDY(t.address);
        if (!mint) continue;
        out[mint] = {
          symbol: TIDY(t.symbol),
          name: TIDY(t.name),
          logoURI: TIDY(t.logoURI) ?? undefined,
          verified: Boolean(t.verified ?? true),
          decimals: typeof t.decimals === 'number' && Number.isFinite(t.decimals) ? t.decimals : null,
        };
      }
    }

    // ALL → eksikleri tamamla (STRICT'i ezme)
    if (allRes.ok && allRes.data) {
      for (const t of allRes.data) {
        const mint = TIDY(t.address);
        if (!mint) continue;

        const row = out[mint] ?? { symbol: null, name: null, logoURI: undefined, verified: false, decimals: null };

        const aSym = TIDY(t.symbol);
        const aNam = TIDY(t.name);
        const aLogo = TIDY(t.logoURI) ?? undefined;
        const aDec = typeof t.decimals === 'number' && Number.isFinite(t.decimals) ? t.decimals : null;

        if (!row.symbol && aSym) row.symbol = aSym;
        if (!row.name && aNam) row.name = aNam;
        if (!row.logoURI && aLogo) row.logoURI = aLogo;
        if (row.decimals == null && aDec != null) row.decimals = aDec;

        out[mint] = row;
      }
    }

    const res = NextResponse.json({ ok: true, data: out, ...(debug ? { diag } : {}) });
    res.headers.set('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res;
  } catch (e: any) {
    diag.exception = String(e?.message || e);
    return NextResponse.json({ ok: false, error: 'internal', diag }, { status: 500 });
  }
}
