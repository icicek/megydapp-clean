// app/api/auth/link-code/create/route.ts

import { randomInt } from 'crypto';
import { Client } from '@neondatabase/serverless';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  USER_AUTH_COOKIE,
  verifyUserSession,
} from '@/app/api/_lib/user-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function createIdentityLinkCode(): string {
  const value = randomInt(0, 100_000_000);

  return `MEGY-${value
    .toString()
    .padStart(8, '0')}`;
}

type LinkCodeResult = {
  code: string;
  expiresAt: string | Date;
  reused: boolean;
};

type PublicError = Error & {
  statusCode?: number;
  publicMessage?: string;
};

function createPublicError(
  message: string,
  statusCode: number
): PublicError {
  const error = new Error(message) as PublicError;

  error.statusCode = statusCode;
  error.publicMessage = message;

  return error;
}

async function getOrCreateIdentityLinkCode(
  identityId: string
): Promise<LinkCodeResult> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured.');
  }

  const client = new Client(databaseUrl);

  let transactionStarted = false;
  let transactionFinished = false;

  try {
    await client.connect();

    await client.query('BEGIN');
    transactionStarted = true;

    /*
     * Only one Link Code creation flow may run for the same
     * Identity at a time.
     *
     * This lock is released automatically on COMMIT or ROLLBACK.
     */
    await client.query(
      `
        SELECT pg_advisory_xact_lock(
          hashtextextended($1, 0)
        )
      `,
      [`identity-link-code:${identityId}`]
    );

    /*
     * Recheck the Identity after acquiring the lock.
     */
    const identityResult = await client.query(
      `
        SELECT id
        FROM identities
        WHERE id = $1
          AND status = 'active'
        LIMIT 1
      `,
      [identityId]
    );

    if (identityResult.rowCount === 0) {
      throw createPublicError(
        'Active identity not found.',
        404
      );
    }

    /*
     * Reuse the Identity's current active and unused code.
     */
    const activeCodeResult = await client.query<{
      code: string;
      expires_at: Date;
    }>(
      `
        SELECT
          code,
          expires_at
        FROM identity_link_codes
        WHERE identity_id = $1
          AND purpose = 'link_wallet'
          AND used_at IS NULL
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [identityId]
    );

    const activeCode = activeCodeResult.rows[0];

    if (activeCode) {
      await client.query('COMMIT');
      transactionFinished = true;

      return {
        code: activeCode.code,
        expiresAt: activeCode.expires_at,
        reused: true,
      };
    }

    /*
     * Generate a permanently unique Link Code.
     *
     * ON CONFLICT DO NOTHING prevents a random code collision
     * from aborting the transaction.
     */
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidateCode =
        createIdentityLinkCode();

      const insertResult = await client.query<{
        code: string;
        expires_at: Date;
      }>(
        `
          INSERT INTO identity_link_codes (
            identity_id,
            code,
            purpose,
            expires_at
          )
          VALUES (
            $1,
            $2,
            'link_wallet',
            NOW() + INTERVAL '15 minutes'
          )
          ON CONFLICT (code) DO NOTHING
          RETURNING
            code,
            expires_at
        `,
        [identityId, candidateCode]
      );

      const insertedCode =
        insertResult.rows[0];

      if (!insertedCode) {
        continue;
      }

      await client.query('COMMIT');
      transactionFinished = true;

      return {
        code: insertedCode.code,
        expiresAt: insertedCode.expires_at,
        reused: false,
      };
    }

    throw new Error(
      'Failed to create a unique link code after multiple attempts.'
    );
  } catch (error) {
    if (
      transactionStarted &&
      !transactionFinished
    ) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error(
          '[auth/link-code/create] rollback error:',
          rollbackError
        );
      }
    }

    throw error;
  } finally {
    try {
      await client.end();
    } catch (closeError) {
      console.error(
        '[auth/link-code/create] client close error:',
        closeError
      );
    }
  }
}

export async function POST() {
  try {
    const cookieStore = await cookies();

    const token =
      cookieStore.get(USER_AUTH_COOKIE)?.value;

    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Identity session required.',
        },
        {
          status: 401,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    if (token.length > 4096) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid identity session.',
        },
        {
          status: 401,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    const session = verifyUserSession(token);

    if (!session) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid identity session.',
        },
        {
          status: 401,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    const linkCodeResult =
      await getOrCreateIdentityLinkCode(
        session.identityId
      );

    return NextResponse.json(
      {
        ok: true,
        code: linkCodeResult.code,
        expiresAt:
          linkCodeResult.expiresAt,
        reused: linkCodeResult.reused,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error(
      '[auth/link-code/create] error:',
      error
    );

    const handledError =
      error as PublicError;

    return NextResponse.json(
      {
        ok: false,
        error:
          handledError.publicMessage ??
          'Failed to create identity link code.',
      },
      {
        status:
          handledError.statusCode ?? 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}