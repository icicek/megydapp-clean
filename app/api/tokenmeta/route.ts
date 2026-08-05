// app/api/tokenmeta/route.ts

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { NextResponse } from 'next/server';
import {
  Connection,
  PublicKey,
  clusterApiUrl,
} from '@solana/web3.js';

import {
  getTokenMetadata,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';

import {
  getMetadataAccountDataSerializer,
} from '@metaplex-foundation/mpl-token-metadata';

import {
  getServerSolanaConnection,
} from '@/app/api/_lib/solana/serverRpc';

export const revalidate = 0;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type SupportedCluster =
  | 'mainnet-beta'
  | 'devnet';

type MetadataSource =
  | 'token-2022'
  | 'metaplex'
  | 'none';

type MetadataResult = {
  ok: boolean;
  name: string | null;
  symbol: string | null;
  image: string | null;
  source: MetadataSource;
};

type MetadataCacheEntry = {
  expiresAt: number;
  result: MetadataResult;
};

const METAPLEX_PROGRAM_ID =
  new PublicKey(
    'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
  );

/*
 * Successful metadata changes very rarely.
 *
 * Missing metadata is cached for a shorter period so newly
 * created or repaired metadata can appear without a long delay.
 */
const POSITIVE_CACHE_TTL_MS =
  6 * 60 * 60 * 1000;

const NEGATIVE_CACHE_TTL_MS =
  10 * 60 * 1000;

const MAX_MEMORY_CACHE_ENTRIES = 1000;

/*
 * Off-chain metadata is expected to be small.
 *
 * This limit prevents a metadata server from making the route
 * download an arbitrarily large response into memory.
 */
const MAX_METADATA_BYTES =
  512 * 1024;

const MAX_METADATA_REDIRECTS = 3;
const OFFCHAIN_TIMEOUT_MS = 5000;

const POSITIVE_CDN_CACHE_HEADER =
  'public, s-maxage=3600, stale-while-revalidate=86400';

const NEGATIVE_CDN_CACHE_HEADER =
  'public, s-maxage=300, stale-while-revalidate=900';

let cachedDevnetConnection:
  | Connection
  | null = null;

const metadataCache =
  new Map<string, MetadataCacheEntry>();

const metadataInflight =
  new Map<string, Promise<MetadataResult>>();

function getMetadataConnection(
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

  const normalized =
    String(value)
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

  const normalized =
    value
      .toUpperCase()
      .replace(
        /[^A-Z0-9.$_/-]/g,
        ''
      )
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

function isPrivateOrReservedIpv4(
  address: string
): boolean {
  const parts =
    address
      .split('.')
      .map(Number);

  if (
    parts.length !== 4 ||
    parts.some(
      (part) =>
        !Number.isInteger(part) ||
        part < 0 ||
        part > 255
    )
  ) {
    return true;
  }

  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (
      a === 100 &&
      b >= 64 &&
      b <= 127
    ) ||
    (
      a === 169 &&
      b === 254
    ) ||
    (
      a === 172 &&
      b >= 16 &&
      b <= 31
    ) ||
    (
      a === 192 &&
      b === 0
    ) ||
    (
      a === 192 &&
      b === 168
    ) ||
    (
      a === 198 &&
      (
        b === 18 ||
        b === 19
      )
    ) ||
    a >= 224
  );
}

function isPrivateOrReservedIp(
  address: string
): boolean {
  const version = isIP(address);

  if (version === 4) {
    return isPrivateOrReservedIpv4(
      address
    );
  }

  if (version !== 6) {
    return true;
  }

  const normalized =
    address.toLowerCase();

  /*
   * IPv4-mapped IPv6 address.
   */
  if (
    normalized.startsWith(
      '::ffff:'
    )
  ) {
    const mappedIpv4 =
      normalized.slice(
        '::ffff:'.length
      );

    return (
      isIP(mappedIpv4) !== 4 ||
      isPrivateOrReservedIpv4(
        mappedIpv4
      )
    );
  }

  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('2001:db8:')
  );
}

function normalizeExternalUri(
  rawValue: string
): URL {
  const value =
    rawValue.trim();

  let normalizedValue = value;

  if (
    normalizedValue.startsWith(
      'ipfs://'
    )
  ) {
    const ipfsPath =
      normalizedValue
        .slice('ipfs://'.length)
        .replace(/^ipfs\//, '');

    normalizedValue =
      `https://ipfs.io/ipfs/${ipfsPath}`;
  } else if (
    normalizedValue.startsWith(
      'ar://'
    )
  ) {
    const transactionId =
      normalizedValue.slice(
        'ar://'.length
      );

    normalizedValue =
      `https://arweave.net/${transactionId}`;
  }

  const url =
    new URL(normalizedValue);

  if (
    url.protocol !== 'https:' &&
    url.protocol !== 'http:'
  ) {
    throw new Error(
      'UNSUPPORTED_METADATA_PROTOCOL'
    );
  }

  if (
    url.username ||
    url.password
  ) {
    throw new Error(
      'METADATA_URL_CREDENTIALS_NOT_ALLOWED'
    );
  }

  if (
    url.port &&
    url.port !== '80' &&
    url.port !== '443'
  ) {
    throw new Error(
      'METADATA_URL_PORT_NOT_ALLOWED'
    );
  }

  return url;
}

async function assertPublicHostname(
  hostname: string
): Promise<void> {
  const normalizedHostname =
    hostname
      .trim()
      .toLowerCase()
      .replace(/\.$/, '');

  if (
    !normalizedHostname ||
    normalizedHostname === 'localhost' ||
    normalizedHostname.endsWith(
      '.localhost'
    ) ||
    normalizedHostname.endsWith(
      '.local'
    ) ||
    normalizedHostname.endsWith(
      '.internal'
    )
  ) {
    throw new Error(
      'PRIVATE_METADATA_HOST'
    );
  }

  const directIpVersion =
    isIP(normalizedHostname);

  if (directIpVersion) {
    if (
      isPrivateOrReservedIp(
        normalizedHostname
      )
    ) {
      throw new Error(
        'PRIVATE_METADATA_IP'
      );
    }

    return;
  }

  const addresses =
    await lookup(
      normalizedHostname,
      {
        all: true,
        verbatim: true,
      }
    );

  if (!addresses.length) {
    throw new Error(
      'METADATA_HOST_NOT_FOUND'
    );
  }

  for (const result of addresses) {
    if (
      isPrivateOrReservedIp(
        result.address
      )
    ) {
      throw new Error(
        'PRIVATE_METADATA_IP'
      );
    }
  }
}

async function validateExternalUrl(
  rawValue: string
): Promise<URL> {
  const url =
    normalizeExternalUri(rawValue);

  await assertPublicHostname(
    url.hostname
  );

  return url;
}

function isRedirectStatus(
  status: number
): boolean {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
}

async function readLimitedText(
  response: Response,
  maximumBytes: number
): Promise<string> {
  const contentLength =
    Number(
      response.headers.get(
        'content-length'
      ) ?? 0
    );

  if (
    Number.isFinite(contentLength) &&
    contentLength >
      maximumBytes
  ) {
    throw new Error(
      'METADATA_RESPONSE_TOO_LARGE'
    );
  }

  if (!response.body) {
    return '';
  }

  const reader =
    response.body.getReader();

  const decoder =
    new TextDecoder();

  let totalBytes = 0;
  let text = '';

  try {
    while (true) {
      const {
        done,
        value,
      } = await reader.read();

      if (done) {
        break;
      }

      totalBytes +=
        value.byteLength;

      if (
        totalBytes >
        maximumBytes
      ) {
        throw new Error(
          'METADATA_RESPONSE_TOO_LARGE'
        );
      }

      text += decoder.decode(
        value,
        {
          stream: true,
        }
      );
    }

    text += decoder.decode();

    return text;
  } finally {
    reader.releaseLock();
  }
}

async function fetchExternalMetadataJson(
  initialUri: string
): Promise<
  Record<string, unknown> | null
> {
  let currentUrl =
    await validateExternalUrl(
      initialUri
    );

  for (
    let redirectCount = 0;
    redirectCount <=
      MAX_METADATA_REDIRECTS;
    redirectCount += 1
  ) {
    const controller =
      new AbortController();

    const timer =
      setTimeout(
        () => {
          controller.abort();
        },
        OFFCHAIN_TIMEOUT_MS
      );

    let response: Response;

    try {
      response = await fetch(
        currentUrl,
        {
          method: 'GET',
          cache: 'no-store',
          redirect: 'manual',
          signal:
            controller.signal,
          headers: {
            Accept:
              'application/json, text/plain;q=0.8',
          },
        }
      );
    } finally {
      clearTimeout(timer);
    }

    if (
      isRedirectStatus(
        response.status
      )
    ) {
      if (
        redirectCount >=
        MAX_METADATA_REDIRECTS
      ) {
        throw new Error(
          'TOO_MANY_METADATA_REDIRECTS'
        );
      }

      const location =
        response.headers.get(
          'location'
        );

      if (!location) {
        throw new Error(
          'INVALID_METADATA_REDIRECT'
        );
      }

      const redirectedUrl =
        new URL(
          location,
          currentUrl
        );

      currentUrl =
        await validateExternalUrl(
          redirectedUrl.toString()
        );

      continue;
    }

    if (!response.ok) {
      return null;
    }

    const contentType =
      response.headers
        .get('content-type')
        ?.toLowerCase() ||
      '';

    /*
     * A number of legitimate token metadata hosts return
     * JSON with text/plain or without a Content-Type.
     *
     * HTML and XML responses are rejected.
     */
    if (
      contentType.includes(
        'text/html'
      ) ||
      contentType.includes(
        'application/xhtml'
      ) ||
      contentType.includes(
        'xml'
      )
    ) {
      throw new Error(
        'INVALID_METADATA_CONTENT_TYPE'
      );
    }

    const text =
      await readLimitedText(
        response,
        MAX_METADATA_BYTES
      );

    if (!text.trim()) {
      return null;
    }

    const parsed =
      JSON.parse(text) as unknown;

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    return parsed as Record<
      string,
      unknown
    >;
  }

  return null;
}

async function normalizePublicAssetUrl(
  rawValue: unknown
): Promise<string | null> {
  const value = tidy(rawValue);

  if (!value) {
    return null;
  }

  try {
    const url =
      await validateExternalUrl(
        value
      );

    return url.toString();
  } catch {
    return null;
  }
}

function pruneMetadataCache() {
  const now = Date.now();

  for (
    const [key, entry]
    of metadataCache
  ) {
    if (
      entry.expiresAt <= now
    ) {
      metadataCache.delete(key);
    }
  }

  while (
    metadataCache.size >
    MAX_MEMORY_CACHE_ENTRIES
  ) {
    const oldestKey =
      metadataCache
        .keys()
        .next()
        .value as
          | string
          | undefined;

    if (!oldestKey) {
      break;
    }

    metadataCache.delete(
      oldestKey
    );
  }
}

function readMetadataCache(
  key: string
): MetadataResult | null {
  const entry =
    metadataCache.get(key);

  if (!entry) {
    return null;
  }

  if (
    entry.expiresAt <=
    Date.now()
  ) {
    metadataCache.delete(key);

    return null;
  }

  /*
   * Refresh insertion order so frequently accessed entries
   * remain in the bounded cache.
   */
  metadataCache.delete(key);
  metadataCache.set(key, entry);

  return entry.result;
}

function writeMetadataCache(
  key: string,
  result: MetadataResult
) {
  metadataCache.set(key, {
    expiresAt:
      Date.now() +
      (
        result.ok
          ? POSITIVE_CACHE_TTL_MS
          : NEGATIVE_CACHE_TTL_MS
      ),
    result,
  });

  pruneMetadataCache();
}

async function fetchMetaFromConnection(
  connection: Connection,
  mint: PublicKey
): Promise<MetadataResult> {
  let name: string | null = null;
  let symbol: string | null = null;
  let image: string | null = null;

  let source:
    MetadataSource = 'none';

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
        symbol =
          metadataSymbol;
      }

      if (name || symbol) {
        source =
          'token-2022';
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
  if (
    !name ||
    !symbol ||
    !image
  ) {
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
        const serializer =
          getMetadataAccountDataSerializer();

        const [metadata] =
          serializer.deserialize(
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
          symbol =
            metadataSymbol;
        }

        const metadataUri =
          tidy(metadata.uri);

        if (metadataUri) {
          try {
            const metadataJson =
              await fetchExternalMetadataJson(
                metadataUri
              );

            if (metadataJson) {
              image =
                await normalizePublicAssetUrl(
                  metadataJson.image ??
                    metadataJson.logoURI
                );
            }
          } catch (error) {
            console.warn(
              '[tokenmeta] secure off-chain metadata lookup failed:',
              error
            );
          }
        }

        if (
          name ||
          symbol ||
          image
        ) {
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

async function getCachedMetadata(
  cluster: SupportedCluster,
  mint: PublicKey
): Promise<{
  result: MetadataResult;
  cacheStatus:
    | 'HIT'
    | 'MISS'
    | 'INFLIGHT';
}> {
  const cacheKey =
    `${cluster}:${mint.toBase58()}`;

  const cached =
    readMetadataCache(
      cacheKey
    );

  if (cached) {
    return {
      result: cached,
      cacheStatus: 'HIT',
    };
  }

  const existingPromise =
    metadataInflight.get(
      cacheKey
    );

  if (existingPromise) {
    return {
      result:
        await existingPromise,
      cacheStatus: 'INFLIGHT',
    };
  }

  const promise =
    (async () => {
      const connection =
        getMetadataConnection(
          cluster
        );

      const result =
        await fetchMetaFromConnection(
          connection,
          mint
        );

      writeMetadataCache(
        cacheKey,
        result
      );

      return result;
    })();

  metadataInflight.set(
    cacheKey,
    promise
  );

  try {
    return {
      result: await promise,
      cacheStatus: 'MISS',
    };
  } finally {
    metadataInflight.delete(
      cacheKey
    );
  }
}

function metadataResponse(
  body: Record<string, unknown>,
  options: {
    status?: number;
    cacheStatus?: string;
    cacheControl?: string;
  } = {}
) {
  const response =
    NextResponse.json(
      body,
      {
        status:
          options.status ?? 200,
      }
    );

  response.headers.set(
    'Cache-Control',
    options.cacheControl ??
      'no-store'
  );

  if (options.cacheStatus) {
    response.headers.set(
      'x-cache',
      options.cacheStatus
    );
  }

  return response;
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
      return metadataResponse(
        {
          ok: false,
          error:
            'Unsupported cluster.',
        },
        {
          status: 400,
        }
      );
    }

    const cluster:
      SupportedCluster =
        clusterValue;

    if (!mintString) {
      return metadataResponse(
        {
          ok: false,
          error: 'Missing ?mint=',
        },
        {
          status: 400,
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
      return metadataResponse(
        {
          ok: false,
          error: 'Invalid mint',
        },
        {
          status: 400,
        }
      );
    }

    const {
      result,
      cacheStatus,
    } =
      await getCachedMetadata(
        cluster,
        mint
      );

    if (!result.ok) {
      return metadataResponse(
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
          cacheStatus,
          cacheControl:
            NEGATIVE_CDN_CACHE_HEADER,
        }
      );
    }

    return metadataResponse(
      {
        ...result,
        cluster,
        mint: mint.toBase58(),
      },
      {
        cacheStatus,
        cacheControl:
          POSITIVE_CDN_CACHE_HEADER,
      }
    );
  } catch (error) {
    console.error(
      '[tokenmeta] request failed:',
      error
    );

    return metadataResponse(
      {
        ok: false,
        error:
          'Failed to read token metadata.',
      },
      {
        status: 500,
      }
    );
  }
}