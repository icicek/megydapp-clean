//app/api/auth/fingerprint/route.ts
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sql } from '@/app/api/_lib/db';
import { USER_AUTH_COOKIE, verifyUserSession } from '@/app/api/_lib/user-auth';
import { recalculateIdentityScores } from '@/app/api/_lib/identity-score';

export const dynamic = 'force-dynamic';

function hashIp(ip: string) {
  const secret =
    process.env.USER_SESSION_SECRET ||
    process.env.JWT_SECRET ||
    process.env.ADMIN_JWT_SECRET ||
    'coin-fingerprint-fallback';

  return crypto.createHmac('sha256', secret).update(ip).digest('hex');
}

function getRequestIp(req: NextRequest) {
  const forwardedFor = req.headers.get('x-forwarded-for');

  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || null;
  }

  return (
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    null
  );
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(USER_AUTH_COOKIE)?.value;
    const session = token ? verifyUserSession(token) : null;

    if (!session) {
      return NextResponse.json({
        ok: true,
        authenticated: false,
        recorded: false,
      });
    }

    const body = await req.json();

    const fingerprintHash = String(body.fingerprintHash || '').trim();
    const walletAddress = String(body.walletAddress || session.walletAddress).trim();
    const source = String(body.source || 'web').trim();

    if (!fingerprintHash || fingerprintHash.length < 20 || fingerprintHash.length > 200) {
      return NextResponse.json(
        { ok: false, error: 'Invalid fingerprint.' },
        { status: 400 }
      );
    }

    const userAgent = req.headers.get('user-agent') || null;
    const ip = getRequestIp(req);
    const ipHash = ip ? hashIp(ip) : null;

    const existingRows = await sql`
      SELECT id
      FROM identity_fingerprints
      WHERE identity_id = ${session.identityId}
        AND fingerprint_hash = ${fingerprintHash}
      LIMIT 1
    `;

    if (existingRows.length > 0) {
      await sql`
        UPDATE identity_fingerprints
        SET
          wallet_address = ${walletAddress},
          user_agent = ${userAgent},
          ip_hash = ${ipHash},
          source = ${source},
          last_seen_at = NOW()
        WHERE id = ${existingRows[0].id}
      `;
    } else {
      await sql`
        INSERT INTO identity_fingerprints (
          identity_id,
          fingerprint_hash,
          wallet_address,
          user_agent,
          ip_hash,
          source,
          first_seen_at,
          last_seen_at
        )
        VALUES (
          ${session.identityId},
          ${fingerprintHash},
          ${walletAddress},
          ${userAgent},
          ${ipHash},
          ${source},
          NOW(),
          NOW()
        )
      `;
    }

    const otherIdentityRows = await sql`
      SELECT COUNT(DISTINCT identity_id)::int AS count
      FROM identity_fingerprints
      WHERE fingerprint_hash = ${fingerprintHash}
        AND identity_id IS NOT NULL
        AND identity_id <> ${session.identityId}
    `;

    const linkedOtherIdentities = Number(otherIdentityRows[0]?.count || 0);

    if (linkedOtherIdentities > 0) {
        const existingRiskRows = await sql`
          SELECT id
          FROM identity_risk_events
          WHERE identity_id = ${session.identityId}
            AND event_type = 'fingerprint_seen_across_identities'
            AND details->>'fingerprintHash' = ${fingerprintHash}
          LIMIT 1
        `;
      
        if (existingRiskRows.length === 0) {
          await sql`
            INSERT INTO identity_risk_events (
              identity_id,
              wallet_address,
              event_type,
              severity,
              score_delta,
              details
            )
            VALUES (
              ${session.identityId},
              ${walletAddress},
              'fingerprint_seen_across_identities',
              'warning',
              10,
              ${JSON.stringify({
                linkedOtherIdentities,
                fingerprintHash,
              })}::jsonb
            )
          `;
        }
    }

    try {
      await recalculateIdentityScores(session.identityId);
    } catch (e) {
      console.error('[identity-score] recalculate failed:', e);
    }

    return NextResponse.json({
      ok: true,
      authenticated: true,
      recorded: true,
      linkedOtherIdentities,
    });
  } catch (error) {
    console.error('[auth/fingerprint] error:', error);

    return NextResponse.json(
      { ok: false, error: 'Failed to record fingerprint.' },
      { status: 500 }
    );
  }
}