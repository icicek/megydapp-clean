//app/api/auth/wallets/route.ts
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
      return NextResponse.json(
        { ok: false, error: 'Identity session required.' },
        { status: 401 }
      );
    }

    const session = verifyUserSession(token);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: 'Invalid identity session.' },
        { status: 401 }
      );
    }

    const rows = await sql`
      SELECT
        wallet_address,
        chain,
        is_primary,
        verified_at,
        last_seen_at,
        created_at
      FROM identity_wallets
      WHERE identity_id = ${session.identityId}
      ORDER BY is_primary DESC, created_at ASC
    `;

    return NextResponse.json({
      ok: true,
      identityId: session.identityId,
      activeWalletAddress: session.walletAddress,
      wallets: rows.map((row) => ({
        walletAddress: row.wallet_address,
        chain: row.chain,
        isPrimary: Boolean(row.is_primary),
        verifiedAt: row.verified_at,
        lastSeenAt: row.last_seen_at,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error('[auth/wallets] error:', error);

    return NextResponse.json(
      { ok: false, error: 'Failed to read linked wallets.' },
      { status: 500 }
    );
  }
}