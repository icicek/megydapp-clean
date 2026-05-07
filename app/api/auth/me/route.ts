//app/api/auth/me/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sql } from '@/app/api/_lib/db';
import { USER_AUTH_COOKIE, verifyUserSession } from '@/app/api/_lib/user-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(USER_AUTH_COOKIE)?.value;

    if (!token) {
      return NextResponse.json({
        ok: true,
        authenticated: false,
      });
    }

    const session = verifyUserSession(token);

    if (!session) {
      return NextResponse.json({
        ok: true,
        authenticated: false,
      });
    }

    const rows = await sql`
      SELECT
        id,
        primary_wallet_address,
        human_confidence_score,
        risk_score,
        status,
        created_at,
        updated_at
      FROM identities
      WHERE id = ${session.identityId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        authenticated: false,
      });
    }

    return NextResponse.json({
      ok: true,
      authenticated: true,
      identity: {
        id: rows[0].id,
        primaryWalletAddress: rows[0].primary_wallet_address,
        walletAddress: session.walletAddress,
        humanConfidenceScore: rows[0].human_confidence_score,
        riskScore: rows[0].risk_score,
        status: rows[0].status,
      },
    });
  } catch (error) {
    console.error('[auth/me] error:', error);

    return NextResponse.json(
      { ok: false, error: 'Failed to read user session.' },
      { status: 500 }
    );
  }
}