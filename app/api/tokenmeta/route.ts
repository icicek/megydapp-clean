// app/api/tokenmeta/route.ts

import { NextResponse } from 'next/server';
import {
  Connection,
  PublicKey,
  clusterApiUrl,
} from '@solana/web3.js';

import {
  getServerSolanaConnection,
} from '@/app/api/_lib/solana/serverRpc';
import {
  getTokenMetadata,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';

import {
  getMetadataAccountDataSerializer,
} from '@metaplex-foundation/mpl-token-metadata';

export const revalidate = 0;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type SupportedCluster =
  | 'mainnet-beta'
  | 'devnet';

const METAPLEX_PROGRAM_ID =
  new PublicKey(
    'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
  );

let cachedDevnetConnection:
  | Connection
  | null = null;

function getMetadataConnection(
  cluster: SupportedCluster
): Connection {
  if (cluster === 'mainnet-beta') {
    return getServerSolanaConnection();
  }

  /*
   * Devnet is an explicitly requested network, not a
   * production-mainnet fallback.
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

function getMetadataPda(
  mint: PublicKey
): PublicKey {
  const seeds = [
    Buffer.from('metadata'),
    METAPLEX_PROGRAM_ID.toBuffer(),
    mint.toBuffer(),
  ];

  const [pda] =
    PublicKey.findProgramAddressSync(
      seeds,
      METAPLEX_PROGRAM_ID
    );

  return pda;
}

function tidy(
  value: unknown
): string | null {
  if (!value) {
    return null;
  }

  const normalized = String(value)
    .replace(/\0/g, '')
    .trim();

  return normalized || null;
}

function sanitizeSymbol(
  value: string | null
): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9.$_/-]/g, '')
    .slice(0, 16);

  return normalized || null;
}

async function withTimeout<T>(
  promise: Promise<T>,
  milliseconds = 5000
): Promise<T> {
  let timer:
    | ReturnType<typeof setTimeout>
    | undefined;

  try {
    return await Promise.race([
      promise,

      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => {
            reject(
              new Error(
                `timeout:${milliseconds}ms`
              )
            );
          },
          milliseconds
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function fetchMetaFromConnection(
  connection: Connection,
  mint: PublicKey
) {
  let name: string | null = null;
  let symbol: string | null = null;
  let image: string | null = null;

  let source:
    | 'token-2022'
    | 'metaplex'
    | 'none' = 'none';

  /*
   * First try Token-2022 metadata extensions.
   */
  try {
    const metadata =
      await withTimeout(
        getTokenMetadata(
          connection,
          mint,
          'confirmed',
          TOKEN_2022_PROGRAM_ID
        ).catch(() => null),
        4000
      );
  
    if (metadata) {
      const metadataName =
        tidy(metadata.name);
  
      const metadataSymbol =
        sanitizeSymbol(
          tidy(metadata.symbol)
        );
  
      if (metadataName) {
        name = metadataName;
      }
  
      if (metadataSymbol) {
        symbol = metadataSymbol;
      }
  
      if (name || symbol) {
        source = 'token-2022';
      }
    }
  } catch (error) {
    console.warn(
      '[tokenmeta] Token-2022 metadata lookup failed:',
      error
    );
  }

  /*
   * Fall back to the Metaplex metadata account.
   */
  if (!name || !symbol || !image) {
    try {
      const metadataPda =
        getMetadataPda(mint);

      const accountInfo =
        await withTimeout(
          connection.getAccountInfo(
            metadataPda,
            'confirmed'
          ),
          4000
        );

      if (accountInfo?.data) {
        const metadataSerializer =
          getMetadataAccountDataSerializer();

        const [metadata] =
          metadataSerializer.deserialize(
            accountInfo.data
          );

        const metadataName =
          tidy(metadata.name);

        const metadataSymbol =
          sanitizeSymbol(
            tidy(metadata.symbol)
          );

        if (metadataName) {
          name = metadataName;
        }

        if (metadataSymbol) {
          symbol = metadataSymbol;
        }

        const metadataUri =
          tidy(metadata.uri);

        if (metadataUri) {
          try {
            const metadataResponse =
              await withTimeout(
                fetch(metadataUri, {
                  cache: 'no-store',
                }),
                4000
              );

            if (metadataResponse.ok) {
              const metadataJson =
                (await metadataResponse.json()) as Record<
                  string,
                  unknown
                >;

              image =
                tidy(metadataJson.image) ||
                tidy(metadataJson.logoURI) ||
                null;
            }
          } catch (error) {
            console.warn(
              '[tokenmeta] off-chain metadata lookup failed:',
              error
            );
          }
        }
        if (name || symbol || image) {
          source = 'metaplex';
        }
      }
    } catch (error) {
      console.warn(
        '[tokenmeta] Metaplex metadata lookup failed:',
        error
      );
    }
  }

  name = tidy(name);

  symbol =
    sanitizeSymbol(
      tidy(symbol)
    );

  image = tidy(image);

  return {
    ok: Boolean(
      name ||
      symbol ||
      image
    ),
    name,
    symbol,
    image,
    source,
  };
}

export async function GET(
  req: Request
) {
  try {
    const url =
      new URL(req.url);

    const mintString =
      url.searchParams
        .get('mint')
        ?.trim();

    const clusterValue =
      url.searchParams
        .get('cluster')
        ?.trim() ||
      'mainnet-beta';

    if (
      clusterValue !==
        'mainnet-beta' &&
      clusterValue !== 'devnet'
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Unsupported cluster.',
        },
        {
          status: 400,
          headers: {
            'Cache-Control':
              'no-store',
          },
        }
      );
    }

    const cluster:
      SupportedCluster =
        clusterValue;

    if (!mintString) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Missing ?mint=',
        },
        {
          status: 400,
          headers: {
            'Cache-Control':
              'no-store',
          },
        }
      );
    }

    let mint: PublicKey;

    try {
      mint =
        new PublicKey(
          mintString
        );
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid mint',
        },
        {
          status: 400,
          headers: {
            'Cache-Control':
              'no-store',
          },
        }
      );
    }

    const connection =
      getMetadataConnection(
        cluster
      );

    const result =
      await fetchMetaFromConnection(
        connection,
        mint
      );

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          name: null,
          symbol: null,
          image: null,
          source: 'none',
          cluster,
          mint: mint.toBase58(),
          error:
            'Token metadata was not found.',
        },
        {
          headers: {
            'Cache-Control':
              'no-store',
          },
        }
      );
    }

    return NextResponse.json(
      {
        ...result,
        cluster,
        mint: mint.toBase58(),
      },
      {
        headers: {
          'Cache-Control':
            'no-store',
        },
      }
    );
  } catch (error) {
    console.error(
      '[tokenmeta] request failed:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          'Failed to read token metadata.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control':
            'no-store',
        },
      }
    );
  }
}