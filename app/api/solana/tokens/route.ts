// app/api/solana/tokens/route.ts
import { NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

export const runtime = 'nodejs';

// Server-side öncelikli RPC adayları (gizli .env + mevcut NEXT_PUBLIC'ler)
const RPC_CANDIDATES = [
  process.env.SOLANA_RPC,                 // önerilen: Helius/Alchemy/QuickNode gibi
  process.env.ALCHEMY_SOLANA_RPC,
  process.env.QUICKNODE_SOLANA_RPC,
  process.env.NEXT_PUBLIC_SOLANA_RPC,     // mevcut public env'lerin server'da fallback olarak okunması
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL, // "
  'https://api.mainnet-beta.solana.com',  // en sonda son çare
].filter(Boolean) as string[];

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

async function fetchFromOwnerParsed(conn: Connection, owner: PublicKey) {
  const c: 'confirmed' = 'confirmed';
  const [v1Res, v22Res] = await Promise.allSettled([
    conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }, c),
    conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }, c),
  ]);
  const v1 = v1Res.status === 'fulfilled' ? v1Res.value.value : [];
  const v22 = v22Res.status === 'fulfilled' ? v22Res.value.value : [];
  return mapParsed([...v1, ...v22]);
}

async function fetchFromProgramParsedFallback(conn: Connection, owner: PublicKey) {
  const c: 'confirmed' = 'confirmed';
  const filters = [{ memcmp: { offset: 32, bytes: owner.toBase58() } }];
  const [v1Res, v22Res] = await Promise.allSettled([
    conn.getParsedProgramAccounts(TOKEN_PROGRAM_ID, { filters, commitment: c }),
    conn.getParsedProgramAccounts(TOKEN_2022_PROGRAM_ID, { filters, commitment: c }),
  ]);
  const v1 = v1Res.status === 'fulfilled' ? v1Res.value : [];
  const v22 = v22Res.status === 'fulfilled' ? v22Res.value : [];
  const shaped = [...v1, ...v22].map((x: any) => ({ account: x.account }));
  return mapParsed(shaped);
}

async function pickConnection(): Promise<Connection | null> {
  for (const ep of RPC_CANDIDATES) {
    try {
      const conn = new Connection(ep!, 'confirmed');
      await conn.getVersion(); // probe
      return conn;
    } catch { /* diğer adaya geç */ }
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ownerStr = url.searchParams.get('owner');
    if (!ownerStr) {
      return NextResponse.json({ success: false, error: 'Missing owner' }, { status: 400 });
    }

    const conn = await pickConnection();
    if (!conn) {
      return NextResponse.json({ success: false, error: 'RPC not reachable' }, { status: 502 });
    }

    const owner = new PublicKey(ownerStr);

    // 1) Owner-parsed
    let positive = await fetchFromOwnerParsed(conn, owner);

    // 2) Boşsa program-parsed fallback
    if (positive.length === 0) {
      positive = await fetchFromProgramParsedFallback(conn, owner);
    }

    // 3) Mint bazında birleştir
    const merged = new Map<string, number>();
    for (const t of positive) merged.set(t.mint, (merged.get(t.mint) ?? 0) + t.amount);

    // 4) Native SOL ekle
    try {
      const lamports = await conn.getBalance(owner, 'confirmed');
      if (lamports > 0) merged.set('SOL', (merged.get('SOL') ?? 0) + lamports / 1e9);
    } catch { /* ignore */ }

    // 5) Ham liste
    const tokens = Array.from(merged.entries())
      .map(([mint, amount]) => ({ mint, amount }))
      .sort((a, b) => b.amount - a.amount);

    return NextResponse.json({ success: true, tokens });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'Server error' },
      { status: 500 }
    );
  }
}
