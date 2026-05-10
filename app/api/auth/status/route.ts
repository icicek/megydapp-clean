//app/api/auth/status/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sql } from '@/app/api/_lib/db';
import {
  USER_AUTH_COOKIE,
  getUserCookieOptions,
  signUserSession,
  verifyUserSession,
} from '@/app/api/_lib/user-auth';
import { recalculateIdentityScores } from '@/app/api/_lib/identity-score';

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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const walletAddress = String(body?.walletAddress || '').trim();

    if (!walletAddress) {
      return NextResponse.json(
        { ok: false, error: 'Wallet address is required.' },
        { status: 400 }
      );
    }

    const walletRows = await sql`
      SELECT
        iw.identity_id,
        iw.wallet_address,
        i.primary_wallet_address,
        i.human_confidence_score,
        i.risk_score,
        i.status
      FROM identity_wallets iw
      JOIN identities i ON i.id = iw.identity_id
      WHERE LOWER(iw.wallet_address) = LOWER(${walletAddress})
        AND iw.chain = 'solana'
        AND iw.verified_at IS NOT NULL
      LIMIT 1
    `;

    if (walletRows.length === 0) {
      return NextResponse.json({
        ok: true,
        recovered: false,
        authenticated: false,
        identity: null,
      });
    }

    const linked = walletRows[0];
    try {
      await recalculateIdentityScores(linked.identity_id);
    } catch (e) {
      console.error('[identity-score] recalculate failed:', e);
    }

    const refreshedIdentityRows = await sql`
      SELECT
        human_confidence_score,
        risk_score,
        status
      FROM identities
      WHERE id = ${linked.identity_id}
      LIMIT 1
    `;

    const refreshedIdentity = refreshedIdentityRows[0] || linked;

    const sessionToken = signUserSession({
      identityId: linked.identity_id,
      walletAddress: linked.wallet_address,
    });

    const fingerprintRows = await sql`
      SELECT id
      FROM identity_fingerprints
      WHERE identity_id = ${linked.identity_id}
      LIMIT 1
    `;

    const socialRows = await sql`
      SELECT id
      FROM identity_socials
      WHERE identity_id = ${linked.identity_id}
        AND provider = 'x'
        AND verified_at IS NOT NULL
      LIMIT 1
    `;

    const linkedWalletCountRows = await sql`
      SELECT COUNT(*)::int AS count
      FROM identity_wallets
      WHERE identity_id = ${linked.identity_id}
        AND chain = 'solana'
        AND verified_at IS NOT NULL
    `;

    const riskScore = Number(refreshedIdentity.risk_score || 0);
    const humanConfidenceScore = Number(refreshedIdentity.human_confidence_score || 0);
    const fingerprintRecorded = fingerprintRows.length > 0;
    const xLinked = socialRows.length > 0;
    const linkedWalletCount = Number(linkedWalletCountRows[0]?.count || 0);

    const claimReady =
      refreshedIdentity.status === 'active' &&
      fingerprintRecorded &&
      riskScore < 50;

    const response = NextResponse.json({
      ok: true,
      recovered: true,
      authenticated: true,
      identity: {
        id: linked.identity_id,
        primaryWalletAddress: linked.primary_wallet_address,
        walletAddress: linked.wallet_address,
        humanConfidenceScore,
        riskScore,
        status: refreshedIdentity.status,
        walletVerified: true,
        fingerprintRecorded,
        xLinked,
        claimReady,
        linkedWalletCount,
      },
    });

    response.cookies.set(
      USER_AUTH_COOKIE,
      sessionToken,
      getUserCookieOptions()
    );

    return response;
  } catch (error) {
    console.error('[auth/status/recover] error:', error);

    return NextResponse.json(
      { ok: false, error: 'Failed to recover identity session.' },
      { status: 500 }
    );
  }
}