// app/api/solana/tokens/route.ts  (drop-in)
import { NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

export const runtime = 'nodejs';

const RPC_CANDIDATES = [
  process.env.SOLANA_RPC,
  process.env.ALCHEMY_SOLANA_RPC,
  process.env.QUICKNODE_SOLANA_RPC,
  process.env.NEXT_PUBLIC_SOLANA_RPC,
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
  'https://api.mainnet-beta.solana.com',
].filter(Boolean) as string[];

function isRateLimitedOrForbidden(err: unknown) {
  const s = String((err as any)?.message || err || '');
  return (
    s.includes('429') ||
    s.includes('403') ||
    s.includes('-32005') || // Too many requests
    s.includes('-32052') || // API key not allowed / forbidden
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

  // owner-parsed
  const [v1Res, v22Res] = await Promise.allSettled([
    conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }, c),
    conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }, c),
  ]);
  let accs: any[] = [];
  if (v1Res.status === 'fulfilled') accs = accs.concat(v1Res.value.value);
  if (v22Res.status === 'fulfilled') accs = accs.concat(v22Res.value.value);

  // parsed boşsa program-parsed fallback
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

  // map + merge
  const positive = mapParsed(accs);
  const merged = new Map<string, number>();
  for (const t of positive) merged.set(t.mint, (merged.get(t.mint) ?? 0) + t.amount);

  // SOL
  try {
    const lamports = await conn.getBalance(owner, c);
    if (lamports > 0) merged.set('SOL', (merged.get('SOL') ?? 0) + lamports / 1e9);
  } catch {}

  return Array.from(merged.entries())
    .map(([mint, amount]) => ({ mint, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ownerStr = url.searchParams.get('owner');
    if (!ownerStr) return NextResponse.json({ success: false, error: 'Missing owner' }, { status: 400 });
    const owner = new PublicKey(ownerStr);

    let lastErr: any = null;
    for (const ep of RPC_CANDIDATES) {
      try {
        const conn = new Connection(ep, 'confirmed');
        // hızlı probeye bile quota gelebilir; direkt iş akışını deneyip olur/olmaz karar veriyoruz
        const tokens = await fetchOnce(conn, owner);
        const res = NextResponse.json({ success: true, tokens });
        res.headers.set('x-rpc-used', ep); // debug için
        return res;
      } catch (e) {
        lastErr = e;
        if (isRateLimitedOrForbidden(e)) continue; // sıradaki RPC’yi dene
        // başka tip bir hata ise yine sıradaki RPC’ye geç, en sonda raporlarız
      }
    }
    return NextResponse.json(
      { success: false, error: 'All RPCs failed', detail: String(lastErr ?? '') },
      { status: 502 }
    );
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Server error' }, { status: 500 });
  }
}
