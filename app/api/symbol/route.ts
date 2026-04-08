// app/api/symbol/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/app/api/_lib/db';

type CacheRow = {
  mint: string;
  symbol: string | null;
  name: string | null;
  logo_uri: string | null;
  source: string | null;
  updated_at?: string | Date | null;
};

const CACHE_HEADER = 'public, s-maxage=300, stale-while-revalidate=600';

const tidy = (x: unknown) => {
  if (!x) return null;
  const s = String(x).replace(/\0/g, '').trim();
  return s || null;
};

const sanitizeSym = (s: string | null) => {
  if (!s) return null;
  const z = s.toUpperCase().replace(/[^A-Z0-9.$_/-]/g, '').slice(0, 16);
  return z || null;
};

function jsonWithCache(body: any, status = 200) {
  const res = NextResponse.json(body, { status });
  res.headers.set('Cache-Control', CACHE_HEADER);
  return res;
}

async function fetchJSON<T>(
  url: string,
  init?: RequestInit,
  ms = 7000
): Promise<{ ok: boolean; data?: T; err?: string }> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);

  try {
    const r = await fetch(url, {
      cache: 'no-store',
      signal: ctrl.signal,
      headers: {
        'user-agent': 'coincarnation-symbol/2.0',
        accept: 'application/json',
        ...(init?.headers || {}),
      },
      ...init,
    });

    if (!r.ok) {
      return { ok: false, err: `HTTP ${r.status}` };
    }

    const j = (await r.json()) as T;
    return { ok: true, data: j };
  } catch (e: any) {
    return {
      ok: false,
      err: e?.name === 'AbortError' ? 'timeout' : String(e?.message || e),
    };
  } finally {
    clearTimeout(id);
  }
}

async function getCachedMetadata(mint: string): Promise<CacheRow | null> {
  try {
    const result = await sql`
      SELECT mint, symbol, name, logo_uri, source, updated_at
      FROM token_metadata_cache
      WHERE mint = ${mint}
      LIMIT 1
    `;

    return (result[0] as CacheRow) || null;

  } catch (e) {
    console.error('[api/symbol] cache read failed', { mint, error: String(e) });
    return null;
  }
}

async function upsertMetadata(params: {
  mint: string;
  symbol: string | null;
  name: string | null;
  logo_uri?: string | null;
  source: string;
}) {
  const { mint, symbol, name, logo_uri = null, source } = params;

  if (!symbol && !name && !logo_uri) {
    console.log('[api/symbol] skip cache write: empty payload', { mint, source });
    return;
  }

  try {
    await sql`
      INSERT INTO token_metadata_cache (
        mint,
        symbol,
        name,
        logo_uri,
        source,
        updated_at
      )
      VALUES (
        ${mint},
        ${symbol},
        ${name},
        ${logo_uri},
        ${source},
        NOW()
      )
      ON CONFLICT (mint)
      DO UPDATE SET
        symbol = EXCLUDED.symbol,
        name = EXCLUDED.name,
        logo_uri = COALESCE(EXCLUDED.logo_uri, token_metadata_cache.logo_uri),
        source = EXCLUDED.source,
        updated_at = NOW()
    `;

    console.log('[api/symbol] cache upsert ok', {
      mint,
      symbol,
      name,
      source,
      hasLogo: Boolean(logo_uri),
    });
  } catch (e) {
    console.error('[api/symbol] cache upsert failed', {
      mint,
      source,
      error: String(e),
    });
  }
}

async function resolveFromTokenlist(origin: string, mint: string) {
  try {
    const r = await fetch(`${origin}/api/tokenlist`, { cache: 'force-cache' });
    if (!r.ok) return null;

    const j = await r.json();
    const row = j?.data?.[mint];

    const symbol = sanitizeSym(tidy(row?.symbol));
    const name = tidy(row?.name);
    const logo_uri = tidy(row?.logoURI);

    if (!symbol && !name && !logo_uri) return null;

    return {
      symbol,
      name,
      logo_uri,
      source: 'tokenlist',
    };
  } catch (e) {
    console.error('[api/symbol] tokenlist failed', { mint, error: String(e) });
    return null;
  }
}

async function resolveFromDexScreener(mint: string) {
  try {
    type DexResp = {
      pairs?: Array<{
        baseToken?: {
          symbol?: string;
          name?: string;
        };
        info?: {
          imageUrl?: string;
        };
      }>;
    };

    const dx = await fetchJSON<DexResp>(
      `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mint)}`,
      undefined,
      3500
    );

    const pair = dx.ok ? (dx.data?.pairs?.[0] ?? null) : null;
    const symbol = sanitizeSym(tidy(pair?.baseToken?.symbol));
    const name = tidy(pair?.baseToken?.name);
    const logo_uri = tidy(pair?.info?.imageUrl);

    if (!symbol && !name && !logo_uri) return null;

    return {
      symbol,
      name,
      logo_uri,
      source: 'dexscreener',
    };
  } catch (e) {
    console.error('[api/symbol] dexscreener failed', { mint, error: String(e) });
    return null;
  }
}

async function resolveFromCoinGecko(mint: string) {
  try {
    type GeckoResp = {
      data?: {
        attributes?: {
          symbol?: string;
          name?: string;
          image_url?: string;
        };
      };
    };

    const geckoUrl =
      `https://api.coingecko.com/api/v3/onchain/networks/solana/tokens/${encodeURIComponent(mint)}/info`;

    const geckoHeaders: Record<string, string> = {};
    if (process.env.COINGECKO_API_KEY) {
      geckoHeaders['x-cg-pro-api-key'] = process.env.COINGECKO_API_KEY;
    } else if (process.env.COINGECKO_DEMO_API_KEY) {
      geckoHeaders['x-cg-demo-api-key'] = process.env.COINGECKO_DEMO_API_KEY;
    }

    const cg = await fetchJSON<GeckoResp>(
      geckoUrl,
      { headers: geckoHeaders },
      4000
    );

    const symbol = sanitizeSym(tidy(cg.data?.data?.attributes?.symbol));
    const name = tidy(cg.data?.data?.attributes?.name);
    const logo_uri = tidy(cg.data?.data?.attributes?.image_url);

    if (!symbol && !name && !logo_uri) return null;

    return {
      symbol,
      name,
      logo_uri,
      source: 'coingecko',
    };
  } catch (e) {
    console.error('[api/symbol] coingecko failed', { mint, error: String(e) });
    return null;
  }
}

async function resolveFromOnChain(origin: string, mint: string) {
  try {
    const r = await fetch(
      `${origin}/api/tokenmeta?mint=${encodeURIComponent(mint)}`,
      { cache: 'no-store' }
    );

    if (!r.ok) return null;

    const oc = await r.json();

    const symbol = sanitizeSym(tidy(oc?.symbol));
    const name = tidy(oc?.name);
    const logo_uri = tidy(oc?.image || oc?.logoURI);

    if (!symbol && !name && !logo_uri) return null;

    return {
      symbol,
      name,
      logo_uri,
      source: 'onchain',
    };
  } catch (e) {
    console.error('[api/symbol] onchain failed', { mint, error: String(e) });
    return null;
  }
}

export async function GET(req: NextRequest) {
  const mint = tidy(req.nextUrl.searchParams.get('mint'));
  const force = req.nextUrl.searchParams.get('force') === '1';
  const origin = req.nextUrl.origin;

  if (!mint) {
    return jsonWithCache({ ok: false, error: 'missing_mint' }, 400);
  }

  try {
    // 0) cache-first
    if (!force) {
      const cached = await getCachedMetadata(mint);
      if (cached && (cached.symbol || cached.name || cached.logo_uri)) {
        return jsonWithCache({
          ok: true,
          symbol: sanitizeSym(tidy(cached.symbol)),
          name: tidy(cached.name),
          logoURI: tidy(cached.logo_uri),
          source: cached.source || 'db_cache',
          cached: true,
        });
      }
    }

    // 1) tokenlist
    const tokenlist = await resolveFromTokenlist(origin, mint);
    if (tokenlist) {
      console.log('[api/symbol] source hit', {
        mint,
        source: 'tokenlist',
        symbol: tokenlist.symbol,
        name: tokenlist.name,
        hasLogo: Boolean(tokenlist.logo_uri),
      });
      await upsertMetadata({
        mint,
        symbol: tokenlist.symbol,
        name: tokenlist.name,
        logo_uri: tokenlist.logo_uri,
        source: tokenlist.source,
      });

      return jsonWithCache({
        ok: true,
        symbol: tokenlist.symbol,
        name: tokenlist.name,
        logoURI: tokenlist.logo_uri,
        source: tokenlist.source,
        cached: false,
      });
    }

    // 2) DexScreener
    const dex = await resolveFromDexScreener(mint);
    if (dex) {
      console.log('[api/symbol] source hit', {
        mint,
        source: 'dexscreener',
        symbol: dex.symbol,
        name: dex.name,
        hasLogo: Boolean(dex.logo_uri),
      });
      await upsertMetadata({
        mint,
        symbol: dex.symbol,
        name: dex.name,
        logo_uri: dex.logo_uri,
        source: dex.source,
      });

      return jsonWithCache({
        ok: true,
        symbol: dex.symbol,
        name: dex.name,
        logoURI: dex.logo_uri,
        source: dex.source,
        cached: false,
      });
    }

    // 3) CoinGecko
    const cg = await resolveFromCoinGecko(mint);
    if (cg) {
      console.log('[api/symbol] source hit', {
        mint,
        source: 'coingecko',
        symbol: cg.symbol,
        name: cg.name,
        hasLogo: Boolean(cg.logo_uri),
      });
      await upsertMetadata({
        mint,
        symbol: cg.symbol,
        name: cg.name,
        logo_uri: cg.logo_uri,
        source: cg.source,
      });

      return jsonWithCache({
        ok: true,
        symbol: cg.symbol,
        name: cg.name,
        logoURI: cg.logo_uri,
        source: cg.source,
        cached: false,
      });
    }

    // 4) on-chain metadata
    const onchain = await resolveFromOnChain(origin, mint);
    if (onchain) {
      console.log('[api/symbol] source hit', {
        mint,
        source: 'onchain',
        symbol: onchain.symbol,
        name: onchain.name,
        hasLogo: Boolean(onchain.logo_uri),
      });
      await upsertMetadata({
        mint,
        symbol: onchain.symbol,
        name: onchain.name,
        logo_uri: onchain.logo_uri,
        source: onchain.source,
      });

      return jsonWithCache({
        ok: true,
        symbol: onchain.symbol,
        name: onchain.name,
        logoURI: onchain.logo_uri,
        source: onchain.source,
        cached: false,
      });
    }

    return jsonWithCache({
      ok: true,
      symbol: null,
      name: null,
      logoURI: null,
      source: 'none',
      cached: false,
    });
  } catch (e: any) {
    console.error('[api/symbol] fatal', { mint, error: String(e?.message || e) });

    return jsonWithCache({
      ok: true,
      symbol: null,
      name: null,
      logoURI: null,
      source: 'error',
      cached: false,
    });
  }
}