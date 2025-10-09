// app/api/solana/tokens/route.ts
import { NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

// Bu route Node.js runtime'da çalışsın (Edge sınırlamalarından kaçın)
export const runtime = 'nodejs';

// .env.local içine birini eklemen yeterli (ilk bulunan kullanılır):
// SOLANA_RPC=https://mainnet.helius-rpc.com/?api-key=XXXXX
// veya ALCHEMY_SOLANA_RPC=https://solana-mainnet.g.alchemy.com/v2/XXXXX
// veya QUICKNODE_SOLANA_RPC=https://<your-endpoint>.quiknode.pro/XXXXX/
const RPC_CANDIDATES = [
  process.env.SOLANA_RPC,
  process.env.ALCHEMY_SOLANA_RPC,
  process.env.QUICKNODE_SOLANA_RPC,
  'https://api.mainnet-beta.solana.com', // son çare
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
      try {
        ui = Number(BigInt(raw)) / Math.pow(10, decimals);
      } catch {
        ui = Number(raw) / Math.pow(10, decimals);
      }
    }
    if (ui > 0) out.push({ mint, amount: ui });
  }
  return out;
}

async function fetchFromOwnerParsed(conn: Connection, owner: PublicKey) {
  const commitment: 'confirmed' = 'confirmed';
  const [v1Res, v22Res] = await Promise.allSettled([
    conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }, commitment),
    conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }, commitment),
  ]);
  const v1 = v1Res.status === 'fulfilled' ? v1Res.value.value : [];
  const v22 = v22Res.status === 'fulfilled' ? v22Res.value.value : [];
  return mapParsed([...v1, ...v22]);
}

async function fetchFromProgramParsedFallback(conn: Connection, owner: PublicKey) {
  const commitment: 'confirmed' = 'confirmed';
  const filters = [{ memcmp: { offset: 32, bytes: owner.toBase58() } }];
  const [v1Res, v22Res] = await Promise.allSettled([
    conn.getParsedProgramAccounts(TOKEN_PROGRAM_ID, { filters, commitment }),
    conn.getParsedProgramAccounts(TOKEN_2022_PROGRAM_ID, { filters, commitment }),
  ]);
  const v1 = v1Res.status === 'fulfilled' ? v1Res.value : [];
  const v22 = v22Res.status === 'fulfilled' ? v22Res.value : [];
  const shaped = [...v1, ...v22].map((x: any) => ({ account: x.account }));
  return mapParsed(shaped);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ownerStr = url.searchParams.get('owner');
    if (!ownerStr) {
      return NextResponse.json({ success: false, error: 'Missing owner' }, { status: 400 });
    }

    const owner = new PublicKey(ownerStr);

    // Çalışan bir RPC seç
    let conn: Connection | null = null;
    for (const ep of RPC_CANDIDATES) {
      try {
        const test = new Connection(ep!, 'confirmed');
        await test.getVersion(); // probe
        conn = test;
        break;
      } catch {
        // diğer adaya geç
      }
    }
    if (!conn) {
      return NextResponse.json({ success: false, error: 'RPC not reachable' }, { status: 502 });
    }

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
    } catch {
      // ignore
    }

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
