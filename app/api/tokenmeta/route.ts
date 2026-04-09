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

function tidy(x: unknown) {
  if (!x) return null;
  const s = String(x).replace(/\0/g, '').trim();
  return s || null;
}

function sanitizeSym(s: string | null) {
  if (!s) return null;
  const z = s.toUpperCase().replace(/[^A-Z0-9.$_/-]/g, '').slice(0, 16);
  return z || null;
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

async function withTimeout<T>(promise: Promise<T>, ms = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout:${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchMetaFromConn(conn: Connection, mint: PublicKey) {
  let name: string | null = null;
  let symbol: string | null = null;
  let image: string | null = null;
  let source: 'token-2022' | 'metaplex' | 'none' = 'none';

  try {
    const mod: any = await import('@solana/spl-token-metadata').catch(() => null);

    if (mod?.getTokenMetadata) {
      const ext = await withTimeout(
        mod.getTokenMetadata(conn, mint).catch(() => null),
        4000
      );

      if (ext && typeof ext === 'object') {
        const extObj = ext as Record<string, unknown>;
      
        const extName =
          typeof extObj.name === 'string' ? tidy(extObj.name) : null;
      
        const extSymbol =
          typeof extObj.symbol === 'string'
            ? sanitizeSym(tidy(extObj.symbol))
            : null;
      
        if (extName) name = extName;
        if (extSymbol) symbol = extSymbol;
      
        if (name || symbol) {
          source = 'token-2022';
        }
      }
    }
  } catch {
    // ignore
  }

  if (!name || !symbol || !image) {
    try {
      const pda = getMetadataPda(mint);
      const acc = await withTimeout(conn.getAccountInfo(pda, 'confirmed'), 4000);

      if (acc?.data) {
        const mdMod: any = await import('@metaplex-foundation/mpl-token-metadata').catch(() => null);

        if (mdMod?.Metadata?.deserialize) {
          const [md] = mdMod.Metadata.deserialize(acc.data);

          const n = tidy(md?.data?.name);
          const s = sanitizeSym(tidy(md?.data?.symbol));

          if (n) name = n;
          if (s) symbol = s;

          const uri = tidy(md?.data?.uri);
          if (uri) {
            try {
              const metaRes = await withTimeout(
                fetch(uri, { cache: 'no-store' }),
                4000
              );

              if (metaRes.ok) {
                const metaJson = await metaRes.json();
                image = tidy(metaJson?.image) || tidy(metaJson?.logoURI) || null;
              }
            } catch {
              // ignore
            }
          }

          if (name || symbol || image) {
            source = 'metaplex';
          }
        }
      }
    } catch {
      // ignore
    }
  }

  name = tidy(name);
  symbol = sanitizeSym(tidy(symbol));
  image = tidy(image);

  return {
    ok: Boolean(name || symbol || image),
    name,
    symbol,
    image,
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
      return NextResponse.json(
        { ok: false, error: 'Missing ?mint=' },
        { status: 400 }
      );
    }

    let mint: PublicKey;
    try {
      mint = new PublicKey(mintStr);
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid mint' },
        { status: 400 }
      );
    }

    const endpoints =
      cluster === 'devnet'
        ? ['https://api.devnet.solana.com']
        : [...RPC_CANDIDATES, fallbackRpc(cluster)];

    let lastErr: unknown = null;
    let lastRpc = '';
    let lastEmptyRpc = '';

    for (const ep of endpoints) {
      try {
        const conn = new Connection(ep, 'confirmed');
        const result = await fetchMetaFromConn(conn, mint);

        if (result.ok) {
          return NextResponse.json({
            ...result,
            cluster,
            mint: mintStr,
            rpc: ep,
          });
        }

        lastEmptyRpc = ep;
      } catch (e) {
        lastErr = e;
        lastRpc = ep;

        if (isRateLimitedOrForbidden(e)) {
          continue;
        }
      }
    }

    return NextResponse.json({
      ok: false,
      name: null,
      symbol: null,
      image: null,
      source: 'none',
      cluster,
      mint: mintStr,
      rpc: lastEmptyRpc || lastRpc || null,
      error: lastErr ? String(lastErr) : null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}