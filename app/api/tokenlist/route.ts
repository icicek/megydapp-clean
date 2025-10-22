// app/api/tokenlist/route.ts
import { NextResponse } from 'next/server';

type Meta = {
  symbol: string;
  name: string;
  logoURI?: string;
  verified?: boolean;
  decimals?: number | null;
};

let CACHE: Record<string, Meta> | null = null;
let EXPIRES = 0;

export const revalidate = 0;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const now = Date.now();

  if (!CACHE || now > EXPIRES) {
    try {
      const res = await fetch('https://token.jup.ag/all', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Upstream ${res.status}`);

      const list = await res.json();
      const map: Record<string, Meta> = {};
      for (const t of list as any[]) {
        map[t.address] = {
          symbol: t.symbol,
          name: t.name,
          logoURI: t.logoURI,
          verified:
            Boolean(t.extensions?.coingeckoId) ||
            Array.isArray(t.tags) && t.tags.includes('verified'),
          decimals: typeof t.decimals === 'number' ? t.decimals : null,
        };
      }
      CACHE = map;
      EXPIRES = now + 6 * 60 * 60 * 1000; // 6h
    } catch (e) {
      // Network/Upstream sorunu: eski cache varsa ona güven, yoksa kısa TTL ile boş dön
      CACHE = CACHE ?? null;
      EXPIRES = now + 5 * 60 * 1000; // 5m
    }
  }

  return NextResponse.json({
    success: true,
    data: CACHE,
    ttl: Math.max(0, EXPIRES - Date.now()),
  });
}
