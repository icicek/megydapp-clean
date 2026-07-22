// app/api/auth/nonce/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { sql } from '@/app/api/_lib/db';
import {
  buildUserAuthMessage,
  createUserNonce,
} from '@/app/api/_lib/user-auth';

export const dynamic = 'force-dynamic';

function normalizeWalletAddress(walletAddress: unknown): string {
  const value = String(walletAddress ?? '').trim();

  if (!value) {
    throw new Error('Invalid wallet address.');
  }

  try {
    return new PublicKey(value).toBase58();
  } catch {
    throw new Error('Invalid wallet address.');
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;

    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid request body.',
        },
        {
          status: 400,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    let walletAddress: string;

    try {
      walletAddress = normalizeWalletAddress(
        body.walletAddress
      );
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid wallet address.',
        },
        {
          status: 400,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    /*
     * Only one active authentication nonce should exist
     * for a wallet at any given time.
     */
    await sql`
      UPDATE user_nonces
      SET used_at = NOW()
      WHERE wallet_address = ${walletAddress}
        AND purpose = 'user_auth'
        AND used_at IS NULL
    `;

    const nonce = createUserNonce();

    const message = buildUserAuthMessage(
      walletAddress,
      nonce
    );

    await sql`
      INSERT INTO user_nonces (
        wallet_address,
        nonce,
        purpose,
        expires_at
      )
      VALUES (
        ${walletAddress},
        ${nonce},
        'user_auth',
        NOW() + INTERVAL '10 minutes'
      )
    `;

    return NextResponse.json(
      {
        ok: true,
        walletAddress,
        nonce,
        message,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('[auth/nonce] error:', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to create auth nonce.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}