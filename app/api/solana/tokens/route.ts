// app/api/solana/tokens/route.ts
import { NextResponse } from 'next/server';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

export const runtime = 'nodejs';
export const revalidate = 0;
export const dynamic = 'force-dynamic';

// Multi-provider sıra (ilk başarılı olan kullanılır)
const RPC_CANDIDATES = [
  process.env.ALCHEMY_SOLANA_RPC,         // Alchemy
  process.env.SOLANA_RPC,                 // Helius
  process.env.QUICKNODE_SOLANA_RPC,       // QuickNode
  process.env.NEXT_PUBLIC_SOLANA_RPC,
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
].filter(Boolean) as string[];

function fallbackRpc(cluster: 'mainnet-beta' | 'devnet') {
  return clusterApiUrl(cluster);
}

// ✅ Daha gerçekçi TTL (serverless + UX)
const CACHE_TTL_MS = 20_000; // 20 sn

type CacheEntry = { at: number; body: any; rpcUsed?: string };
const cache = new Map<string, CacheEntry>();

// ✅ Aynı anda gelen istekleri tekle
const inflight = new Map<string, Promise<{ body: any; rpcUsed: string }>>();

// CDN cache header: 15 sn canlı, 60 sn SWR
const CDN_CACHE_HEADER = 's-maxage=15, stale-while-revalidate=60';

// Native SOL'u WSOL mint’i ile hizalıyoruz
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

function isRateLimitedOrForbidden(err: unknown) {
  const s = String((err as any)?.message || err || '');
  return (
    s.includes('429') ||
    s.includes('403') ||
    s.includes('-32005') ||
    s.includes('-32052') ||
    s.toLowerCase().includes('forbidden') ||
    s.toLowerCase().includes('rate limit') ||
    s.toLowerCase().includes('access forbidden')
  );
}

type ParsedRow = { mint: string; raw: bigint; decimals: number };

function safeBigInt(n: string): bigint {
  try { return BigInt(n); } catch { return 0n; }
}

function extractRows(accs: any[]): ParsedRow[] {
  const out: ParsedRow[] = [];
  for (const { account } of accs) {
    const info = account?.data?.parsed?.info;
    const amt = info?.tokenAmount;
    const mint: string | undefined = info?.mint;
    if (!mint || !amt) continue;

    const decimals = Number(amt.decimals ?? 0);
    const raw = safeBigInt(typeof amt.amount === 'string' ? amt.amount : '0');
    out.push({ mint, raw, decimals: Number.isFinite(decimals) ? decimals : 0 });
  }
  return out;
}

async function fetchOnce(conn: Connection, owner: PublicKey) {
  const c: 'confirmed' = 'confirmed';

  // ✅ Sadece owner-parsed (en ucuz yol)
  const [v1Res, v22Res] = await Promise.allSettled([
    conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }, c),
    conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }, c),
  ]);

  let accs: any[] = [];
  if (v1Res.status === 'fulfilled') accs = accs.concat(v1Res.value.value);
  if (v22Res.status === 'fulfilled') accs = accs.concat(v22Res.value.value);

  // normalize & merge by mint
  const rows = extractRows(accs);
  const merged = new Map<string, { raw: bigint; decimals: number }>();
  for (const r of rows) {
    const prev = merged.get(r.mint);
    if (!prev) merged.set(r.mint, { raw: r.raw, decimals: r.decimals });
    else merged.set(r.mint, { raw: prev.raw + r.raw, decimals: prev.decimals });
  }

  // Native SOL (lamports) → WSOL mint
  try {
    const lamports = await conn.getBalance(owner, c);
    if (lamports > 0) {
      const prev = merged.get(WSOL_MINT);
      const raw = BigInt(lamports);
      if (!prev) merged.set(WSOL_MINT, { raw, decimals: 9 });
      else merged.set(WSOL_MINT, { raw: prev.raw + raw, decimals: prev.decimals });
    }
  } catch {
    // ignore
  }

  const tokens = Array.from(merged.entries())
    .map(([mint, { raw, decimals }]) => {
      // ⚠️ Number(bigint) overflow riskine karşı daha güvenli parse:
      // (çok büyük değerlerde bile crash olmasın diye)
      const rawStr = raw.toString();
      const amount =
        decimals > 0
          ? parseFloat(rawStr) / Math.pow(10, decimals)
          : parseFloat(rawStr);

      return { mint, raw: rawStr, decimals, amount: Number.isFinite(amount) ? amount : 0 };
    })
    .sort((a, b) => b.amount - a.amount);

  return tokens;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const owner = url.searchParams.get('owner');
    const cluster =
      (url.searchParams.get('cluster') as 'mainnet-beta' | 'devnet') || 'mainnet-beta';
    const force = url.searchParams.get('force') === '1';

    if (!owner) {
      return NextResponse.json({ success: false, error: 'Missing owner' }, { status: 400 });
    }

    let ownerPk: PublicKey;
    try {
      ownerPk = new PublicKey(owner);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid owner (non-base58)' }, { status: 400 });
    }

    const cacheKey = `${cluster}:${ownerPk.toBase58()}`;
    const now = Date.now();

    // 1) hot cache
    const hot = cache.get(cacheKey);
    if (!force && hot && now - hot.at < CACHE_TTL_MS) {
      const res = NextResponse.json(hot.body);
      res.headers.set('x-cache', 'HIT');
      if (hot.rpcUsed) res.headers.set('x-rpc-used', hot.rpcUsed);
      res.headers.set('cache-control', CDN_CACHE_HEADER);
      return res;
    }

    // 2) inflight dedupe (aynı key için tek RPC turu)
    if (!force) {
      const p = inflight.get(cacheKey);
      if (p) {
        const { body, rpcUsed } = await p;
        const res = NextResponse.json(body);
        res.headers.set('x-cache', 'INFLIGHT');
        res.headers.set('x-inflight', '1');
        res.headers.set('x-rpc-used', rpcUsed);
        res.headers.set('cache-control', CDN_CACHE_HEADER);
        return res;
      }
    }

    let lastErr: any = null;
    let lastRpc = '';

    const endpoints = [...RPC_CANDIDATES, fallbackRpc(cluster)];

    const runner = (async () => {
      for (const ep of endpoints) {
        try {
          const conn = new Connection(ep, 'confirmed');
          const tokens = await fetchOnce(conn, ownerPk);

          const body = { success: true, tokens, wsolMint: WSOL_MINT };
          cache.set(cacheKey, { at: Date.now(), body, rpcUsed: ep });
          return { body, rpcUsed: ep };
        } catch (e) {
          lastErr = e;
          lastRpc = ep;
          if (isRateLimitedOrForbidden(e)) continue;
          // diğer hatalarda da denemeye devam
        }
      }
      throw new Error(`All RPCs failed. lastRpc=${lastRpc} detail=${String(lastErr ?? '')}`);
    })();

    if (!force) inflight.set(cacheKey, runner);

    try {
      const { body, rpcUsed } = await runner;
      const res = NextResponse.json(body);
      res.headers.set('x-cache', force ? 'BYPASS' : 'MISS');
      res.headers.set('x-rpc-used', rpcUsed);
      res.headers.set('cache-control', CDN_CACHE_HEADER);
      return res;
    } finally {
      inflight.delete(cacheKey);
    }
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Server error' },
      { status: 500 }
    );
  }
}