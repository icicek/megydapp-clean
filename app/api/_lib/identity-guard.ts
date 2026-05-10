//app/api/_lib/identity-guard.ts
import { cookies } from 'next/headers';
import { sql } from '@/app/api/_lib/db';
import { USER_AUTH_COOKIE, verifyUserSession } from '@/app/api/_lib/user-auth';

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

export async function requireIdentityWalletAccess(
  walletAddress: string
): Promise<IdentityGuardResult> {
  const wallet = String(walletAddress || '').trim();

  if (!wallet) {
    return {
      ok: false,
      status: 400,
      error: 'WALLET_REQUIRED',
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

  if (session.walletAddress.toLowerCase() !== wallet.toLowerCase()) {
    return {
      ok: false,
      status: 403,
      error: 'IDENTITY_WALLET_MISMATCH',
    };
  }

  const rows = await sql`
    SELECT i.status, i.risk_score
    FROM identity_wallets iw
    JOIN identities i ON i.id = iw.identity_id
    WHERE iw.identity_id = ${session.identityId}
      AND LOWER(iw.wallet_address) = LOWER(${wallet})
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
  const riskScore = Number(identity.risk_score ?? 0);
  const status = String(identity.status || '');

  if (status !== 'active' || riskScore >= 50) {
    return {
      ok: false,
      status: 403,
      error: 'IDENTITY_NOT_READY',
    };
  }

  return {
    ok: true,
    identityId: session.identityId,
    walletAddress: session.walletAddress,
    riskScore,
    status,
  };
}

export function identityGuardErrorResponse(result: Extract<IdentityGuardResult, { ok: false }>) {
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