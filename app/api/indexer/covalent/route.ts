// app/api/indexer/covalent/route.ts

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  /*
   * EVM indexing is not part of the current production launch.
   * Keep the route available only outside production so the
   * server-side Covalent integration can still be developed/tested.
   */
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      {
        success: false,
        error: 'EVM_INDEXER_NOT_AVAILABLE',
      },
      {
        status: 404,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  const { searchParams } =
    new URL(req.url);

  const chainId =
    searchParams.get('chainId')?.trim();

  const address =
    searchParams.get('address')?.trim();

  if (!chainId || !address) {
    return NextResponse.json(
      {
        success: false,
        error: 'chainId & address required',
      },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  const key =
    process.env.COVALENT_KEY?.trim();

  if (!key) {
    return NextResponse.json(
      {
        success: false,
        error: 'COVALENT_KEY_MISSING',
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  const url =
    `https://api.covalenthq.com/v1/` +
    `${encodeURIComponent(chainId)}/address/` +
    `${encodeURIComponent(address)}/balances_v2/` +
    `?no-nft-fetch=true&quote-currency=USD&key=` +
    encodeURIComponent(key);

  try {
    const res =
      await fetch(url, {
        cache: 'no-store',
      });

    if (!res.ok) {
      console.error(
        '[COVALENT_INDEXER] upstream error:',
        res.status
      );

      return NextResponse.json(
        {
          success: false,
          error: 'COVALENT_UPSTREAM_ERROR',
        },
        {
          status: 502,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    const json =
      await res.json();

    return NextResponse.json(
      json,
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error(
      '[COVALENT_INDEXER] request failed:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: 'COVALENT_REQUEST_FAILED',
      },
      {
        status: 502,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}