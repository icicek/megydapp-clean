// app/api/tokenlist/route.ts
import { NextResponse } from 'next/server';

type Meta = { symbol: string; name: string; logoURI?: string; verified?: boolean };

// basit bellek cache (Edge/Node ortamı farkında çalışır)
let CACHE: Record<string, Meta> | null = null;
let EXPIRES = 0;

export async function GET() {
  const now = Date.now();
  if (!CACHE || now > EXPIRES) {
    try {
      const res = await fetch('https://token.jup.ag/all', { cache: 'no-store' });
      const list = await res.json();
      const map: Record<string, Meta> = {};
      for (const t of list as any[]) {
        map[t.address] = {
          symbol: t.symbol,
          name: t.name,
          logoURI: t.logoURI,
          verified: Boolean(t.extensions?.coingeckoId) || (t.tags || []).includes('verified'),
        };
      }
      CACHE = map;
      EXPIRES = now + 6 * 60 * 60 * 1000; // 6 saat
    } catch {
      // network yoksa: CACHE null kalır → istemci fallback kullanır
      CACHE = null;
      EXPIRES = now + 5 * 60 * 1000;
    }
  }
  return NextResponse.json({ success: true, data: CACHE, ttl: Math.max(0, EXPIRES - Date.now()) });
}
