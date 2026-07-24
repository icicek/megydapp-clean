// app/api/auth/link-code/create/route.ts

import { randomInt } from 'crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { sql } from '@/app/api/_lib/db';
import {
  USER_AUTH_COOKIE,
  verifyUserSession,
} from '@/app/api/_lib/user-auth';

export const dynamic = 'force-dynamic';

function createIdentityLinkCode(): string {
  const value = randomInt(0, 100_000_000);

  return `MEGY-${value
    .toString()
    .padStart(8, '0')}`;
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

    const identityRows = await sql`
      SELECT id
      FROM identities
      WHERE id = ${session.identityId}
        AND status = 'active'
      LIMIT 1
    `;

    if (identityRows.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Active identity not found.',
        },
        {
          status: 404,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    /*
     * Invalidate all previous unused link-wallet codes
     * belonging to this identity.
     */
    await sql`
      UPDATE identity_link_codes
      SET used_at = NOW()
      WHERE identity_id = ${session.identityId}
        AND purpose = 'link_wallet'
        AND used_at IS NULL
    `;

    let code = createIdentityLinkCode();

    for (let i = 0; i < 5; i += 1) {
      try {
        const rows = await sql`
          INSERT INTO identity_link_codes (
            identity_id,
            code,
            purpose,
            expires_at
          )
          VALUES (
            ${session.identityId},
            ${code},
            'link_wallet',
            NOW() + INTERVAL '15 minutes'
          )
          RETURNING code, expires_at
        `;

        const codeRow = rows[0];

        if (!codeRow?.code || !codeRow?.expires_at) {
          throw new Error(
            'Link code creation did not return a valid record.'
          );
        }

        return NextResponse.json(
          {
            ok: true,
            code: codeRow.code,
            expiresAt: codeRow.expires_at,
          },
          {
            headers: {
              'Cache-Control': 'no-store',
            },
          }
        );
      } catch (error) {
        const postgresError = error as {
          code?: string;
        };

        /*
         * Retry only when the generated code collides
         * with the unique code index.
         */
        if (postgresError?.code !== '23505') {
          throw error;
        }

        code = createIdentityLinkCode();
      }
    }

    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to create a unique link code.',
      },
      {
        status: 500,
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

    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to create identity link code.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}