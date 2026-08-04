// app/api/solana/tokens/route.ts
import { NextResponse } from 'next/server';
import {
  Connection,
  PublicKey,
  clusterApiUrl,
} from '@solana/web3.js';

import {
  getServerSolanaConnection,
} from '@/app/api/_lib/solana/serverRpc';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ✅ TTL (serverless + UX)
const CACHE_TTL_MS = 20_000; // 20 sn

type CacheEntry = {
  at: number;
  body: {
    success: true;
    tokens: Array<{
      mint: string;
      raw: string;
      decimals: number;
      uiAmountString: string;
      amount: number;
    }>;
    wsolMint: string;
  };
};
const cache = new Map<string, CacheEntry>();

// ✅ Aynı anda gelen istekleri tekle
const inflight = new Map<
  string,
  Promise<CacheEntry['body']>
>();

// ✅ CDN cache header: 15 sn canlı, 60 sn SWR
const CDN_CACHE_HEADER = 'public, s-maxage=15, stale-while-revalidate=60';

// ✅ Native SOL'u WSOL mint’i ile hizalıyoruz
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

type SupportedCluster =
  | 'mainnet-beta'
  | 'devnet';

let cachedDevnetConnection:
  | Connection
  | null = null;

function getTokensConnection(
  cluster: SupportedCluster
): Connection {
  if (cluster === 'mainnet-beta') {
    return getServerSolanaConnection();
  }

  /*
   * Devnet is available only when explicitly requested.
   * It is never used as a mainnet fallback.
   */
  if (!cachedDevnetConnection) {
    cachedDevnetConnection =
      new Connection(
        clusterApiUrl('devnet'),
        'confirmed'
      );
  }

  return cachedDevnetConnection;
}

type ParsedRow = { mint: string; raw: bigint; decimals: number };

function safeBigInt(n: string): bigint {
  try { return BigInt(n); } catch { return 0n; }
}

function rawToUiString(raw: string, decimals: number): string {
  if (!raw) return '0';
  const s = String(raw).replace(/^0+/, '') || '0';
  if (!decimals) return s;
  if (s.length <= decimals) {
    const zeros = '0'.repeat(decimals - s.length);
    const frac = (zeros + s).replace(/0+$/, '');
    return frac ? `0.${frac}` : '0';
  }
  const int = s.slice(0, s.length - decimals) || '0';
  const frac = s.slice(s.length - decimals).replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
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

async function fetchOnce(
  connection: Connection,
  owner: PublicKey
) {
  const commitment = 'confirmed' as const;

  /*
   * Do not silently convert RPC failures into an empty wallet.
   *
   * A successful response must represent a complete snapshot:
   * legacy SPL tokens, Token-2022 tokens and native SOL.
   */
  const [
    legacyTokenResult,
    token2022Result,
    lamports,
  ] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(
      owner,
      {
        programId: TOKEN_PROGRAM_ID,
      },
      commitment
    ),

    connection.getParsedTokenAccountsByOwner(
      owner,
      {
        programId: TOKEN_2022_PROGRAM_ID,
      },
      commitment
    ),

    connection.getBalance(
      owner,
      commitment
    ),
  ]);

  const accounts = [
    ...legacyTokenResult.value,
    ...token2022Result.value,
  ];

  const rows = extractRows(accounts);

  const merged = new Map<
    string,
    {
      raw: bigint;
      decimals: number;
    }
  >();

  for (const row of rows) {
    const previous =
      merged.get(row.mint);

    if (!previous) {
      merged.set(row.mint, {
        raw: row.raw,
        decimals: row.decimals,
      });

      continue;
    }

    merged.set(row.mint, {
      raw: previous.raw + row.raw,
      decimals: previous.decimals,
    });
  }

  /*
   * Represent native SOL with the canonical WSOL mint so
   * the rest of the application can use one token shape.
   */
  if (lamports > 0) {
    const previous =
      merged.get(WSOL_MINT);

    const raw =
      BigInt(lamports);

    if (!previous) {
      merged.set(WSOL_MINT, {
        raw,
        decimals: 9,
      });
    } else {
      merged.set(WSOL_MINT, {
        raw: previous.raw + raw,
        decimals: previous.decimals,
      });
    }
  }

  return Array.from(
    merged.entries()
  )
    .map(
      ([
        mint,
        {
          raw,
          decimals,
        },
      ]) => {
        const rawString =
          raw.toString();

        const uiAmountString =
          rawToUiString(
            rawString,
            decimals
          );

        const approximateAmount =
          decimals > 0
            ? Number(uiAmountString)
            : Number(rawString);

        const amount =
          Number.isFinite(
            approximateAmount
          )
            ? approximateAmount
            : 0;

        return {
          mint,
          raw: rawString,
          decimals,
          uiAmountString,
          amount,
        };
      }
    )
    .sort(
      (first, second) =>
        second.amount -
        first.amount
    );
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tag = url.searchParams.get('tag') || 'none';
    const owner = url.searchParams.get('owner');
    const clusterValue =
      url.searchParams
        .get('cluster')
        ?.trim() ||
      'mainnet-beta';

    if (
      clusterValue !== 'mainnet-beta' &&
      clusterValue !== 'devnet'
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unsupported cluster',
        },
        {
          status: 400,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    const cluster: SupportedCluster =
      clusterValue;

    /*
    * Public callers must not be able to bypass cache in production.
    * Local development may still use ?force=1 for diagnostics.
    */
    const force =
      process.env.NODE_ENV !== 'production' &&
      url.searchParams.get('force') === '1';

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

    // ✅ DEBUG: who is calling me?
    const src = req.headers.get('x-cc-source') || 'unknown';
    const page = req.headers.get('x-cc-page') || 'unknown';
    const ua = req.headers.get('user-agent') || 'unknown';
    const ref = req.headers.get('referer') || 'none';
    const isTrustedClient = src === 'useWalletTokens';

    console.log(
      `[api/solana/tokens] enter src=${src} page=${page} tag=${tag} ref=${ref} ua=${ua.slice(0, 80)}`
    );

    // 1) hot cache
    const hot = cache.get(cacheKey);
    if (!force && hot && now - hot.at < CACHE_TTL_MS) {
      console.log(`[api/solana/tokens] cache=HIT src=${src} page=${page}`);
      const res = NextResponse.json(hot.body);
      res.headers.set('x-cache', 'HIT');
      res.headers.set('Cache-Control', CDN_CACHE_HEADER);
      return res;
    }

    if (!isTrustedClient && !force) {
      // Unknown callers should not trigger repeated expensive work.
      // If we already have an inflight request, join it.
      const p = inflight.get(cacheKey);
      if (p) {
        console.log(`[api/solana/tokens] unknown caller joined inflight`);
        const body = await p;
        const res = NextResponse.json(body);
        res.headers.set('x-cache', 'INFLIGHT-UNKNOWN');
        res.headers.set('Cache-Control', CDN_CACHE_HEADER);
        return res;
      }
    }

    // Unknown callers: do not let them hit RPC aggressively.
    // If no warm cache exists yet, allow current flow for now.
    // In next step, we can hard-block or rate-limit them.
    if (!isTrustedClient) {
      console.log(
        `[api/solana/tokens] unknown-caller src=${src} page=${page} ref=${ref} ua=${ua.slice(0, 80)}`
      );
    }

    // 2) inflight dedupe
    if (!force) {
      const p = inflight.get(cacheKey);
      if (p) {
        console.log(`[api/solana/tokens] cache=INFLIGHT src=${src} page=${page}`);
        const body = await p;
        const res = NextResponse.json(body);
        res.headers.set('x-cache', 'INFLIGHT');
        res.headers.set('x-inflight', '1');
        res.headers.set('Cache-Control', CDN_CACHE_HEADER);
        return res;
      }
    }

    const runner = (async () => {
      const connection =
        getTokensConnection(cluster);
    
      const tokens =
        await fetchOnce(
          connection,
          ownerPk
        );
    
      const body: CacheEntry['body'] = {
        success: true,
        tokens,
        wsolMint: WSOL_MINT,
      };
    
      cache.set(cacheKey, {
        at: Date.now(),
        body,
      });
    
      return body;
    })();

    if (!force) inflight.set(cacheKey, runner);

    try {
      const body = await runner;

      console.log(
        `[api/solana/tokens] cache=${
          force ? 'BYPASS' : 'MISS'
        } src=${src} page=${page} ref=${ref}`
      );

      const response =
        NextResponse.json(body);

      response.headers.set(
        'x-cache',
        force ? 'BYPASS' : 'MISS'
      );

      response.headers.set(
        'Cache-Control',
        force
          ? 'no-store'
          : CDN_CACHE_HEADER
      );

      return response;
    } finally {
      inflight.delete(cacheKey);
    }
  } catch (error) {
    console.error(
      '[api/solana/tokens] request failed:',
      error
    );
  
    const response =
      NextResponse.json(
        {
          success: false,
          error:
            'Failed to read wallet tokens.',
        },
        {
          status: 503,
        }
      );
  
    response.headers.set(
      'Cache-Control',
      'no-store'
    );
  
    return response;
  }
}