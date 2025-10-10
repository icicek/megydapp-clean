// app/api/solana/tokens/route.ts
import { NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

export const runtime = 'nodejs';

// Multi-provider sıra (ilk çalışan kullanılır)
const RPC_CANDIDATES = [
  process.env.SOLANA_RPC,                 // Helius (önerilen)
  process.env.ALCHEMY_SOLANA_RPC,         // Alchemy (yedek)
  process.env.QUICKNODE_SOLANA_RPC,       // QuickNode (varsa)
  process.env.NEXT_PUBLIC_SOLANA_RPC,     // public fallback (server'da yine işe yarar)
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL, // public fallback
  'https://api.mainnet-beta.solana.com',  // son çare
].filter(Boolean) as string[];

// 30 sn in-memory cache (aynı instance içinde; Vercel warm olduğunda fayda sağlar)
const CACHE_TTL_MS = 30_000;
type CacheEntry = { at: number; body: any; rpcUsed?: string };
const cache = new Map<string, CacheEntry>();

// Ayrıca CDN/Edge için cache header'ı: 30 sn canlı, 120 sn SWR
const CDN_CACHE_HEADER = 's-maxage=30, stale-while-revalidate=120';

function isRateLimitedOrForbidden(err: unknown) {
  const s = String((err as any)?.message || err || '');
  return (
    s.includes('429') ||
    s.includes('403') ||
    s.includes('-32005') || // Too many requests
    s.includes('-32052') || // Forbidden / key not allowed
    s.toLowerCase().includes('forbidden') ||
    s.toLowerCase().includes('rate')
  );
}

function mapParsed(accs: any[]) {
  const out: { mint: string; amount: number }[] = [];
  for (const { account } of accs) {
    const info = account?.data?.parsed?.info;
    const amt = info?.tokenAmount;
    const mint: string | undefined = info?.mint;
    if (!mint || !amt) continue;

    const decimals = Number(amt.decimals ?? 0);
    let ui = typeof amt.uiAmount === 'number' ? amt.uiAmount : undefined;
    if (ui == null) {
      const raw = typeof amt.amount === 'string' ? amt.amount : '0';
      try { ui = Number(BigInt(raw)) / Math.pow(10, decimals); }
      catch { ui = Number(raw) / Math.pow(10, decimals); }
    }
    if (ui > 0) out.push({ mint, amount: ui });
  }
  return out;
}

async function fetchOnce(conn: Connection, owner: PublicKey) {
  const c: 'confirmed' = 'confirmed';

  // 1) owner-parsed
  const [v1Res, v22Res] = await Promise.allSettled([
    conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }, c),
    conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }, c),
  ]);

  let accs: any[] = [];
  if (v1Res.status === 'fulfilled') accs = accs.concat(v1Res.value.value);
  if (v22Res.status === 'fulfilled') accs = accs.concat(v22Res.value.value);

  // 2) parsed boşsa program-parsed fallback
  if (accs.length === 0) {
    const filters = [{ memcmp: { offset: 32, bytes: owner.toBase58() } }];
    const [p1, p2] = await Promise.allSettled([
      conn.getParsedProgramAccounts(TOKEN_PROGRAM_ID, { filters, commitment: c }),
      conn.getParsedProgramAccounts(TOKEN_2022_PROGRAM_ID, { filters, commitment: c }),
    ]);
    const v1 = p1.status === 'fulfilled' ? p1.value : [];
    const v2 = p2.status === 'fulfilled' ? p2.value : [];
    accs = [...v1, ...v2].map((x: any) => ({ account: x.account }));
  }

  // 3) map + merge
  const positive = mapParsed(accs);
  const merged = new Map<string, number>();
  for (const t of positive) merged.set(t.mint, (merged.get(t.mint) ?? 0) + t.amount);

  // 4) SOL
  try {
    const lamports = await conn.getBalance(owner, c);
    if (lamports > 0) merged.set('SOL', (merged.get('SOL') ?? 0) + lamports / 1e9);
  } catch {}

  // 5) token list
  return Array.from(merged.entries())
    .map(([mint, amount]) => ({ mint, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const owner = url.searchParams.get('owner');
    if (!owner) return NextResponse.json({ success: false, error: 'Missing owner' }, { status: 400 });

    const cacheKey = owner;
    const now = Date.now();

    // In-memory cache (hot instance)
    const hot = cache.get(cacheKey);
    if (hot && now - hot.at < CACHE_TTL_MS) {
      const res = NextResponse.json(hot.body);
      res.headers.set('x-cache', 'HIT');
      if (hot.rpcUsed) res.headers.set('x-rpc-used', hot.rpcUsed);
      res.headers.set('Cache-Control', CDN_CACHE_HEADER);
      return res;
    }

    let lastErr: any = null;
    let lastRpc = '';

    // Failover: sırayla bütün RPC'ler
    for (const ep of RPC_CANDIDATES) {
      try {
        const conn = new Connection(ep, 'confirmed');
        const tokens = await fetchOnce(conn, new PublicKey(owner));

        const body = { success: true, tokens };
        const res = NextResponse.json(body);
        res.headers.set('x-cache', 'MISS');
        res.headers.set('x-rpc-used', ep);
        res.headers.set('Cache-Control', CDN_CACHE_HEADER);

        // sıcak cache’e yaz
        cache.set(cacheKey, { at: now, body, rpcUsed: ep });

        return res;
      } catch (e) {
        lastErr = e;
        lastRpc = ep;
        if (isRateLimitedOrForbidden(e)) continue; // sıradakine geç
        // başka bir hata da olsa denemeye devam ediyoruz
      }
    }

    return NextResponse.json(
      { success: false, error: 'All RPCs failed', detail: String(lastErr ?? ''), lastRpc },
      { status: 502 }
    );
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Server error' }, { status: 500 });
  }
}
