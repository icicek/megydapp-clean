// app/api/tokenlist/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

async function fetchWithTimeout(url: string, ms = 8000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      cache: 'no-store',
      signal: ctrl.signal,
      headers: {
        'user-agent': 'coincarnation-tokenlist/1.0 (+https://coincarnation.com)',
        'accept': 'application/json',
      },
    });
    return r;
  } finally {
    clearTimeout(id);
  }
}

async function getJson<T>(url: string, tries = 2): Promise<{ ok: boolean; data: T | null; err?: string }> {
  let lastErr = '';
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetchWithTimeout(url, 8000);
      if (!r.ok) { lastErr = `HTTP ${r.status}`; continue; }
      const j = (await r.json()) as T;
      return { ok: true, data: j };
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
    // 1) Jupiter STRICT (otorite)
    const strict = await getJson<JupToken[]>('https://tokens.jup.ag/strict');
    if (debug) diag.strict = strict.ok ? `ok:${strict.data?.length}` : `fail:${strict.err}`;

    // 2) Jupiter ALL (kapsayıcı)
    const all = await getJson<JupToken[]>('https://tokens.jup.ag/all');
    if (debug) diag.all = all.ok ? `ok:${all.data?.length}` : `fail:${all.err}`;

    // 3) FALLBACK: GitHub token listesi (yaygın, ama otorite değil)
    // Not: Bu liste güncel olmayabilir, o yüzden SADECE Jupiter tamamen
    // erişilemediğinde kullanıyoruz ve verified=false işaretliyoruz.
    let gh: { tokens?: any[] } | null = null;
    if (!strict.ok && !all.ok) {
      const ghRes = await getJson<any>('https://raw.githubusercontent.com/solana-labs/token-list/main/src/tokens/solana.tokenlist.json', 1);
      if (debug) diag.github = ghRes.ok ? `ok:${ghRes.data?.tokens?.length}` : `fail:${ghRes.err}`;
      gh = ghRes.ok ? ghRes.data : null;
    }

    if (!strict.ok && !all.ok && !gh) {
      return NextResponse.json({ ok: false, error: 'fetch_failed', diag }, { status: 502 });
    }

    const out: Record<string, ListRow> = {};

    // STRICT temel harita
    if (strict.ok && strict.data) {
      for (const t of strict.data) {
        const mint = TIDY(t.address); if (!mint) continue;
        out[mint] = {
          symbol: TIDY(t.symbol),
          name: TIDY(t.name),
          logoURI: TIDY(t.logoURI) ?? undefined,
          verified: Boolean(t.verified ?? true),
          decimals: (typeof t.decimals === 'number' && Number.isFinite(t.decimals)) ? t.decimals : null,
        };
      }
    }

    // ALL → eksikleri tamamla (STRICT'i ezme!)
    if (all.ok && all.data) {
      for (const t of all.data) {
        const mint = TIDY(t.address); if (!mint) continue;
        const row = out[mint] ?? { symbol: null, name: null, logoURI: undefined, verified: false, decimals: null };

        const aSym = TIDY(t.symbol);
        const aNam = TIDY(t.name);
        const aLogo = TIDY(t.logoURI) ?? undefined;
        const aDec  = (typeof t.decimals === 'number' && Number.isFinite(t.decimals)) ? t.decimals : null;

        if (!row.symbol && aSym) row.symbol = aSym;
        if (!row.name   && aNam) row.name   = aNam;
        if (!row.logoURI && aLogo) row.logoURI = aLogo;
        if (row.decimals == null && aDec != null) row.decimals = aDec;

        out[mint] = row;
      }
    }

    // GitHub FALLBACK → sadece Jupiter tamamen çökerse
    if (!strict.ok && !all.ok && gh?.tokens?.length) {
      for (const t of gh.tokens) {
        const mint = TIDY(t.address); if (!mint) continue;
        // var olanları ezme (zaten yok)
        out[mint] = {
          symbol: TIDY(t.symbol),
          name:   TIDY(t.name),
          logoURI: TIDY(t.logoURI) ?? undefined,
          verified: false,               // Github listesi otorite değil
          decimals: Number.isFinite(t.decimals) ? t.decimals : null,
        };
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
