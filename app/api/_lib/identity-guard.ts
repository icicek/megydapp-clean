// app/api/_lib/identity-guard.ts

import { cookies } from 'next/headers';
import { PublicKey } from '@solana/web3.js';
import { IDENTITY_RISK_BLOCK_THRESHOLD } from '@/app/api/_lib/identity-config';

import { sql } from '@/app/api/_lib/db';
import {
  USER_AUTH_COOKIE,
  verifyUserSession,
} from '@/app/api/_lib/user-auth';

export type IdentityGuardResult =
  | {
      ok: true;
      identityId: string;
      walletAddress: string;
      riskScore: number;
      status: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

function normalizeSolanaWalletAddress(value: unknown): string | null {
  const wallet = String(value || '').trim();

  if (!wallet) {
    return null;
  }

  try {
    return new PublicKey(wallet).toBase58();
  } catch {
    return null;
  }
}

export async function requireIdentityWalletAccess(
  walletAddress: string
): Promise<IdentityGuardResult> {
  const wallet = normalizeSolanaWalletAddress(walletAddress);

  if (!wallet) {
    return {
      ok: false,
      status: 400,
      error: 'INVALID_WALLET_ADDRESS',
    };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(USER_AUTH_COOKIE)?.value;
  const session = token ? verifyUserSession(token) : null;

  if (!session) {
    return {
      ok: false,
      status: 401,
      error: 'IDENTITY_SESSION_REQUIRED',
    };
  }

  /*
   * Identity-wide authorization model:
   *
   * A valid Identity session may authorize any verified Solana wallet
   * linked to the same Identity. The requested wallet does not need to be
   * the wallet that originally created the current browser session.
   */
  const rows = await sql`
    SELECT
      i.status,
      i.risk_score
    FROM identity_wallets iw
    JOIN identities i
      ON i.id = iw.identity_id
    WHERE iw.identity_id = ${session.identityId}
      AND iw.wallet_address = ${wallet}
      AND iw.chain = 'solana'
      AND iw.verified_at IS NOT NULL
    LIMIT 1
  `;

  if (!rows?.length) {
    return {
      ok: false,
      status: 403,
      error: 'WALLET_NOT_LINKED_TO_IDENTITY',
    };
  }

  const identity = rows[0];

  const riskScore = Number(identity.risk_score);
  const status = String(identity.status || '').trim();

  if (!Number.isFinite(riskScore)) {
    return {
      ok: false,
      status: 403,
      error: 'IDENTITY_NOT_READY',
    };
  }

  if (
    status !== 'active' ||
    riskScore >= IDENTITY_RISK_BLOCK_THRESHOLD
  ) {
    return {
      ok: false,
      status: 403,
      error: 'IDENTITY_NOT_READY',
    };
  }

  return {
    ok: true,
    identityId: session.identityId,
    walletAddress: wallet,
    riskScore,
    status,
  };
}

export function identityGuardErrorResponse(
  result: Extract<IdentityGuardResult, { ok: false }>
) {
  return Response.json(
    {
      success: false,
      error: result.error,
    },
    {
      status: result.status,
    }
  );
}