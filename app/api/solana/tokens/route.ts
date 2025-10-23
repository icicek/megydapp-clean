// app/api/solana/tokens/route.ts
import { NextResponse } from 'next/server';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

export const runtime = 'nodejs';
export const revalidate = 0;
export const dynamic = 'force-dynamic';

// Multi-provider sıra (ilk başarılı olan kullanılır)
const RPC_CANDIDATES = [
  process.env.SOLANA_RPC,                 // Helius (önerilen)
  process.env.ALCHEMY_SOLANA_RPC,         // Alchemy
  process.env.QUICKNODE_SOLANA_RPC,       // QuickNode
  process.env.NEXT_PUBLIC_SOLANA_RPC,     // public fallback
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL, // public fallback
].filter(Boolean) as string[];

// Son çare: clusterApiUrl (rate-limit olabilir ama en sonda dursun)
function fallbackRpc(cluster: 'mainnet-beta' | 'devnet') {
  return clusterApiUrl(cluster);
}

// 30 sn in-memory cache (aynı instance içinde)
const CACHE_TTL_MS = 30_000;
type CacheEntry = { at: number; body: any; rpcUsed?: string };
const cache = new Map<string, CacheEntry>();

// CDN/Edge cache header: 30 sn canlı, 120 sn SWR
const CDN_CACHE_HEADER = 's-maxage=30, stale-while-revalidate=120';

// Native SOL'u WSOL mint’i ile hizalıyoruz (UI ticker/ikon)
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

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

type ParsedRow = { mint: string; raw: bigint; decimals: number };

function safeBigInt(n: string): bigint {
  try { return BigInt(n); } catch { return 0n; }
}

/** getParsed* sonuçlarını normalize eder */
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

  // 3) normalize & merge by mint
  const rows = extractRows(accs);
  const merged = new Map<string, { raw: bigint; decimals: number }>();
  for (const r of rows) {
    const prev = merged.get(r.mint);
    if (!prev) merged.set(r.mint, { raw: r.raw, decimals: r.decimals });
    else merged.set(r.mint, { raw: prev.raw + r.raw, decimals: prev.decimals });
  }

  // 4) Native SOL (lamports) → WSOL mint
  try {
    const lamports = await conn.getBalance(owner, c);
    if (lamports > 0) {
      const prev = merged.get(WSOL_MINT);
      const raw = BigInt(lamports); // 1e9 lamports = 1 SOL
      if (!prev) merged.set(WSOL_MINT, { raw, decimals: 9 });
      else merged.set(WSOL_MINT, { raw: prev.raw + raw, decimals: prev.decimals });
    }
  } catch {/* SOL okunamadıysa geç */}

  // 5) response
  const tokens = Array.from(merged.entries())
    .map(([mint, { raw, decimals }]) => {
      const amount =
        decimals > 0 ? Number(raw) / Math.pow(10, decimals) : Number(raw);
      return { mint, raw: raw.toString(), decimals, amount };
    })
    .sort((a, b) => b.amount - a.amount);

  return tokens;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const owner = url.searchParams.get('owner');
    const cluster = (url.searchParams.get('cluster') as 'mainnet-beta' | 'devnet') || 'mainnet-beta';
    if (!owner) {
      return NextResponse.json({ success: false, error: 'Missing owner' }, { status: 400 });
    }

    // In-memory cache (owner+cluster)
    const cacheKey = `${cluster}:${owner}`;
    const now = Date.now();
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

    // RPC sırası: ENV’ler → clusterApiUrl fallback
    const endpoints = [...RPC_CANDIDATES, fallbackRpc(cluster)];

    for (const ep of endpoints) {
      try {
        const conn = new Connection(ep, 'confirmed');
        const tokens = await fetchOnce(conn, new PublicKey(owner));

        const body = { success: true, tokens, wsolMint: WSOL_MINT };
        const res = NextResponse.json(body);
        res.headers.set('x-cache', 'MISS');
        res.headers.set('x-rpc-used', ep);
        res.headers.set('Cache-Control', CDN_CACHE_HEADER);

        cache.set(cacheKey, { at: now, body, rpcUsed: ep });
        return res;
      } catch (e) {
        lastErr = e;
        lastRpc = ep;
        // Rate/forbidden → sıradaki RPC’ye geç
        if (isRateLimitedOrForbidden(e)) continue;
        // Diğer hatalarda da devam et (son hata raporlanacak)
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
