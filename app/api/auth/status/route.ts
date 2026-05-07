//app/api/auth/status/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sql } from '@/app/api/_lib/db';
import { USER_AUTH_COOKIE, verifyUserSession } from '@/app/api/_lib/user-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(USER_AUTH_COOKIE)?.value;
    const session = token ? verifyUserSession(token) : null;

    if (!session) {
      return NextResponse.json({
        ok: true,
        authenticated: false,
        identity: null,
      });
    }

    const identityRows = await sql`
      SELECT
        id,
        primary_wallet_address,
        human_confidence_score,
        risk_score,
        status
      FROM identities
      WHERE id = ${session.identityId}
      LIMIT 1
    `;

    if (identityRows.length === 0) {
      return NextResponse.json({
        ok: true,
        authenticated: false,
        identity: null,
      });
    }

    const walletRows = await sql`
      SELECT id
      FROM identity_wallets
      WHERE identity_id = ${session.identityId}
        AND LOWER(wallet_address) = LOWER(${session.walletAddress})
        AND chain = 'solana'
        AND verified_at IS NOT NULL
      LIMIT 1
    `;

    const fingerprintRows = await sql`
      SELECT id
      FROM identity_fingerprints
      WHERE identity_id = ${session.identityId}
      LIMIT 1
    `;

    const socialRows = await sql`
      SELECT id
      FROM identity_socials
      WHERE identity_id = ${session.identityId}
        AND provider = 'x'
        AND verified_at IS NOT NULL
      LIMIT 1
    `;

    const linkedWalletCountRows = await sql`
      SELECT COUNT(*)::int AS count
      FROM identity_wallets
      WHERE identity_id = ${session.identityId}
        AND chain = 'solana'
        AND verified_at IS NOT NULL
    `;

    const identity = identityRows[0];

    const walletVerified = walletRows.length > 0;
    const fingerprintRecorded = fingerprintRows.length > 0;
    const xLinked = socialRows.length > 0;
    const linkedWalletCount = Number(linkedWalletCountRows[0]?.count || 0);

    const riskScore = Number(identity.risk_score || 0);
    const humanConfidenceScore = Number(identity.human_confidence_score || 0);

    const claimReady =
      identity.status === 'active' &&
      walletVerified &&
      fingerprintRecorded &&
      riskScore < 50;

    return NextResponse.json({
      ok: true,
      authenticated: true,
      identity: {
        id: identity.id,
        primaryWalletAddress: identity.primary_wallet_address,
        walletAddress: session.walletAddress,
        humanConfidenceScore,
        riskScore,
        status: identity.status,
        walletVerified,
        fingerprintRecorded,
        xLinked,
        claimReady,
        linkedWalletCount,
      },
    });
  } catch (error) {
    console.error('[auth/status] error:', error);

    return NextResponse.json(
      { ok: false, error: 'Failed to read identity status.' },
      { status: 500 }
    );
  }
}