// app/api/tokenmeta/route.ts
import { NextResponse } from 'next/server';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';

export const revalidate = 0;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const METAPLEX_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
);

const RPC_CANDIDATES = [
  process.env.ALCHEMY_SOLANA_RPC,
  process.env.SOLANA_RPC,
  process.env.QUICKNODE_SOLANA_RPC,
  process.env.NEXT_PUBLIC_SOLANA_RPC,
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
].filter(Boolean) as string[];

function fallbackRpc(cluster: 'mainnet-beta' | 'devnet') {
  return clusterApiUrl(cluster);
}

function getMetadataPda(mint: PublicKey): PublicKey {
  const seeds = [
    Buffer.from('metadata'),
    METAPLEX_PROGRAM_ID.toBuffer(),
    mint.toBuffer(),
  ];
  const [pda] = PublicKey.findProgramAddressSync(seeds, METAPLEX_PROGRAM_ID);
  return pda;
}

function tidy(x: string | null | undefined) {
  if (!x) return null;
  const s = String(x).replace(/\0/g, '').trim();
  return s || null;
}

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

async function fetchMetaFromConn(conn: Connection, mint: PublicKey) {
  let name: string | null = null;
  let symbol: string | null = null;
  let source: 'token-2022' | 'metaplex' | 'none' = 'none';

  try {
    const mod: any = await import('@solana/spl-token-metadata').catch(() => null);
    if (mod?.getTokenMetadata) {
      const ext = await mod.getTokenMetadata(conn, mint).catch(() => null);
      if (ext) {
        name = tidy(ext.name) ?? name;
        symbol = tidy(ext.symbol) ?? symbol;
        if (name || symbol) source = 'token-2022';
      }
    }
  } catch {}

  if (!name || !symbol) {
    try {
      const pda = getMetadataPda(mint);
      const acc = await conn.getAccountInfo(pda, 'confirmed');
      if (acc?.data) {
        const mdMod: any = await import('@metaplex-foundation/mpl-token-metadata').catch(() => null);
        if (mdMod?.Metadata?.deserialize) {
          const [md] = mdMod.Metadata.deserialize(acc.data);
          const n = tidy(md?.data?.name);
          const s = tidy(md?.data?.symbol);
          if (n) name = n;
          if (s) symbol = s;
          if (name || symbol) source = 'metaplex';
        } else {
          const first = acc.data.subarray(0, 1024).toString('utf8');
          const guessSymbol = tidy((first.match(/[A-Z0-9]{2,10}/)?.[0]) || null);
          if (guessSymbol && !symbol) {
            symbol = guessSymbol;
            source = 'metaplex';
          }
        }
      }
    } catch {}
  }

  name = tidy(name);
  symbol = tidy(symbol);

  return {
    ok: Boolean(name || symbol),
    name,
    symbol,
    source,
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mintStr = searchParams.get('mint');
    const cluster = (searchParams.get('cluster') || 'mainnet-beta') as
      | 'mainnet-beta'
      | 'devnet';

    if (!mintStr) {
      return NextResponse.json({ ok: false, error: 'Missing ?mint=' }, { status: 400 });
    }

    const mint = new PublicKey(mintStr);

    const endpoints =
      cluster === 'devnet'
        ? ['https://api.devnet.solana.com']
        : [...RPC_CANDIDATES, fallbackRpc(cluster)];

    let lastErr: any = null;
    let lastRpc = '';

    for (const ep of endpoints) {
      try {
        const conn = new Connection(ep, 'confirmed');
        const result = await fetchMetaFromConn(conn, mint);

        return NextResponse.json({
          ...result,
          cluster,
          mint: mintStr,
          rpc: ep,
        });
      } catch (e) {
        lastErr = e;
        lastRpc = ep;
        if (isRateLimitedOrForbidden(e)) continue;
      }
    }

    return NextResponse.json(
      {
        ok: false,
        error: `All RPCs failed. lastRpc=${lastRpc} detail=${String(lastErr ?? '')}`,
      },
      { status: 500 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}