// app/api/auth/wallet-status/route.ts

import {
  NextRequest,
  NextResponse,
} from 'next/server';
import { PublicKey } from '@solana/web3.js';

import { sql } from '@/app/api/_lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
) {
  return NextResponse.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

function normalizeWalletAddress(
  value: unknown
): string | null {
  const raw =
    String(value ?? '').trim();

  if (!raw) {
    return null;
  }

  try {
    return new PublicKey(raw).toBase58();
  } catch {
    return null;
  }
}

export async function POST(
  req: NextRequest
) {
  try {
    let body: Record<string, unknown>;

    try {
      const parsed =
        (await req.json()) as unknown;

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        return jsonResponse(
          {
            ok: false,
            error: 'Invalid request body.',
          },
          400
        );
      }

      body =
        parsed as Record<string, unknown>;
    } catch {
      return jsonResponse(
        {
          ok: false,
          error: 'Invalid request body.',
        },
        400
      );
    }

    const walletAddress =
      normalizeWalletAddress(
        body.walletAddress
      );

    if (!walletAddress) {
      return jsonResponse(
        {
          ok: false,
          error: 'Invalid wallet address.',
        },
        400
      );
    }

    const rows = await sql`
        SELECT 1
        FROM identity_wallets
        WHERE wallet_address = ${walletAddress}
          AND chain = 'solana'
          AND verified_at IS NOT NULL
        LIMIT 1
      `;

    const isTest =
      String(process.env.COINCARNATION_PUBLIC_MODE ?? 'test')
        .trim()
        .toLowerCase() !== 'production';

    let referralEligible = false;

    if (rows.length === 0) {
      const previousContributions = await sql`
          SELECT 1
          FROM contributions
          WHERE wallet_address = ${walletAddress}
            AND network = 'solana'
            AND is_test = ${isTest}
          LIMIT 1
        `;

      if (previousContributions.length === 0) {
        const previousParticipants = await sql`
            SELECT 1
            FROM participants
            WHERE wallet_address = ${walletAddress}
              AND network = 'solana'
            LIMIT 1
          `;

        referralEligible = previousParticipants.length === 0;
      }
    }

    return jsonResponse({
      ok: true,
      walletAddress,
      linked: rows.length > 0,
      referralEligible,
    });
  } catch (error) {
    console.error(
      '[auth/wallet-status] error:',
      error
    );

    return jsonResponse(
      {
        ok: false,
        error:
          'Failed to check wallet Identity status.',
      },
      500
    );
  }
}