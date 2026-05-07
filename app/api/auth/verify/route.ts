//app/api/auth/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { sql } from '@/app/api/_lib/db';
import {
    buildUserAuthMessage,
    getUserCookieOptions,
    signUserSession,
    USER_AUTH_COOKIE,
} from '@/app/api/_lib/user-auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const walletAddress = String(body.walletAddress || '').trim();
        const nonce = String(body.nonce || '').trim();
        const signatureBase64 = String(body.signature || '').trim();

        let publicKey: PublicKey;

        try {
            publicKey = new PublicKey(walletAddress);
        } catch {
            return NextResponse.json(
                { ok: false, error: 'Invalid wallet address.' },
                { status: 400 }
            );
        }

        if (!nonce || !signatureBase64) {
            return NextResponse.json(
                { ok: false, error: 'Missing nonce or signature.' },
                { status: 400 }
            );
        }

        const nonceRows = await sql`
      SELECT id
      FROM user_nonces
      WHERE LOWER(wallet_address) = LOWER(${walletAddress})
        AND nonce = ${nonce}
        AND purpose = 'user_auth'
        AND used_at IS NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;

        if (nonceRows.length === 0) {
            return NextResponse.json(
                { ok: false, error: 'Nonce expired or already used.' },
                { status: 401 }
            );
        }

        const expectedMessage = buildUserAuthMessage(walletAddress, nonce);
        const messageBytes = new TextEncoder().encode(expectedMessage);
        const signatureBytes = Buffer.from(signatureBase64, 'base64');

        const isValid = nacl.sign.detached.verify(
            messageBytes,
            signatureBytes,
            publicKey.toBytes()
        );

        if (!isValid) {
            return NextResponse.json(
                { ok: false, error: 'Invalid wallet signature.' },
                { status: 401 }
            );
        }

        await sql`
      UPDATE user_nonces
      SET used_at = NOW()
      WHERE id = ${nonceRows[0].id}
    `;

        const walletRows = await sql`
      SELECT identity_id
      FROM identity_wallets
      WHERE LOWER(wallet_address) = LOWER(${walletAddress})
        AND chain = 'solana'
      LIMIT 1
    `;

        let identityId: string;

        if (walletRows.length > 0) {
            identityId = walletRows[0].identity_id;

            await sql`
        UPDATE identity_wallets
        SET last_seen_at = NOW(),
            verified_at = NOW()
        WHERE identity_id = ${identityId}
          AND LOWER(wallet_address) = LOWER(${walletAddress})
          AND chain = 'solana'
      `;
        } else {
            const identityRows = await sql`
        INSERT INTO identities (
          primary_wallet_address,
          human_confidence_score,
          risk_score,
          status
        )
        VALUES (
          ${walletAddress},
          25,
          0,
          'active'
        )
        RETURNING id
      `;

            identityId = identityRows[0].id;

            await sql`
        INSERT INTO identity_wallets (
          identity_id,
          wallet_address,
          chain,
          is_primary,
          verified_at
        )
        VALUES (
          ${identityId},
          ${walletAddress},
          'solana',
          true,
          NOW()
        )
      `;

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
          ${identityId},
          ${walletAddress},
          'wallet_signature_verified',
          'info',
          0,
          ${JSON.stringify({ chain: 'solana' })}::jsonb
        )
      `;
        }

        const latestIdentityRows = await sql`
        SELECT human_confidence_score, risk_score, status
        FROM identities
        WHERE id = ${identityId}
        LIMIT 1
        `;

        const latestIdentity = latestIdentityRows[0];

        const token = signUserSession({
            identityId,
            walletAddress,
        });

        const res = NextResponse.json({
            ok: true,
            identityId,
            walletAddress,
            humanConfidenceScore: Number(latestIdentity?.human_confidence_score || 0),
            riskScore: Number(latestIdentity?.risk_score || 0),
            status: latestIdentity?.status || 'active',
        });

        res.cookies.set(USER_AUTH_COOKIE, token, getUserCookieOptions());

        return res;
    } catch (error) {
        console.error('[auth/verify] error:', error);

        return NextResponse.json(
            { ok: false, error: 'Failed to verify wallet signature.' },
            { status: 500 }
        );
    }
}